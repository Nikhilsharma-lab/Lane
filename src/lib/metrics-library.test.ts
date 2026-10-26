/**
 * #196: the Metrics library module against the real test database. Each test uses its own
 * workspace, so the first read of that workspace is the one under test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { listMetricDefinitions, readMetricDefinitionHistory, resolveSavedMetrics } from "./metrics-library";

const PREFIX = "org_metrics_library_";
const MAKER = "user_metrics_library_maker";
let connection: ReturnType<typeof postgres>;
let workspaces = 0;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Metrics library tests require disposable local PostgreSQL");
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into profiles (id,full_name,email) values (${MAKER},'Maker','metrics-library@example.test')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id like ${PREFIX + "%"}`;
  await connection`delete from profiles where id = ${MAKER}`;
  await connection.end();
});

async function newWorkspace() {
  const orgId = `${PREFIX}${++workspaces}`;
  await connection`insert into organizations (id,name,slug) values (${orgId},'Metrics library',${orgId.replaceAll("_", "-")})`;
  return { orgId };
}

const STARTERS = [
  { name: "Action count", unit: "count" },
  { name: "Conversion rate", unit: "percent" },
  { name: "Customer satisfaction", unit: "percent" },
  { name: "Feature adoption rate", unit: "percent" },
  { name: "Median time to convert", unit: "seconds" },
  { name: "Support contact rate", unit: "percent" },
  { name: "User error rate", unit: "percent" },
];

describe("The Metrics library of a workspace", () => {
  it("starts with the seven starter metrics, each with a unit and a how-it's-counted line and no link", async () => {
    const workspace = await newWorkspace();
    const definitions = await listMetricDefinitions(workspace);
    expect(definitions.map(({ name, unit }) => ({ name, unit }))).toEqual(STARTERS);
    for (const definition of definitions) {
      expect(definition.howCounted).toMatch(/\S/);
      expect(definition).toMatchObject({ link: null, archivedAt: null, mergedIntoId: null, createdBy: null });
    }
    expect(definitions.map(definition => definition.name)).not.toContain("Pass/fail check");
  });

  it("never gets the starter metrics twice, however often or at once it is read", async () => {
    const workspace = await newWorkspace();
    await Promise.all([listMetricDefinitions(workspace), listMetricDefinitions(workspace), listMetricDefinitions(workspace)]);
    await listMetricDefinitions(workspace);
    const definitions = await listMetricDefinitions(workspace, { includeArchived: true });
    expect(definitions.map(definition => definition.name)).toEqual(STARTERS.map(starter => starter.name));
  });

  it("doesn't bring back a starter metric that was renamed or archived", async () => {
    const workspace = await newWorkspace();
    await listMetricDefinitions(workspace);
    // Renaming and archiving arrive with the library's edit actions (#197, #198); set them up directly here.
    await connection`update metric_definitions set name = 'Checkout conversion' where org_id = ${workspace.orgId} and name = 'Conversion rate'`;
    await connection`update metric_definitions set archived_at = now() where org_id = ${workspace.orgId} and name = 'Action count'`;
    const active = await listMetricDefinitions(workspace);
    expect(active.map(definition => definition.name)).toEqual(["Checkout conversion", "Customer satisfaction", "Feature adoption rate", "Median time to convert", "Support contact rate", "User error rate"]);
    const all = await listMetricDefinitions(workspace, { includeArchived: true });
    expect(all).toHaveLength(7);
    expect(all.find(definition => definition.name === "Action count")?.archivedAt).toBeInstanceOf(Date);
  });

  it("lists only its own workspace's definitions", async () => {
    const mine = await newWorkspace();
    const theirs = await newWorkspace();
    await connection`insert into metric_definitions (org_id,name,unit,link,created_by) values (${theirs.orgId},'Trial starts','count','https://analytics.example.test/trials',${MAKER})`;
    expect((await listMetricDefinitions(theirs)).map(definition => definition.name)).toContain("Trial starts");
    const listed = await listMetricDefinitions(mine);
    expect(listed.map(definition => definition.name)).toEqual(STARTERS.map(starter => starter.name));
  });

  it("keeps a definition's link and how-it's-counted line", async () => {
    const workspace = await newWorkspace();
    await connection`insert into metric_definitions (org_id,name,unit,link,how_counted,created_by) values (${workspace.orgId},'Trial starts','count','https://analytics.example.test/trials','Trials started per week.',${MAKER})`;
    const trial = (await listMetricDefinitions(workspace)).find(definition => definition.name === "Trial starts");
    expect(trial).toMatchObject({ unit: "count", link: "https://analytics.example.test/trials", howCounted: "Trials started per week.", createdBy: MAKER });
  });
});

describe("Resolving metrics saved on Requests (#200)", () => {
  const plan = (primary: Record<string, unknown>, guardrails: Record<string, unknown>[] = []) => ({
    kind: "measurement", version: 4,
    primary: { name: "", current: 1, target: 2, noBaseline: false, check: "", ...primary },
    measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
    guardrails: guardrails.map((guardrail) => ({ name: "", current: null, noBaseline: false, operator: "at_most", limit: 5, ...guardrail })),
  });
  async function typedDefinition(orgId: string, name: string, unit: string, typed = name) {
    const [definition] = await connection`insert into metric_definitions (org_id,name,unit,created_by) values (${orgId},${name},${unit},${MAKER}) returning id`;
    await connection`insert into metric_definition_aliases (org_id,definition_id,typed_name,unit) values (${orgId},${definition.id},public.metric_alias_name(${typed}),public.metric_alias_unit(${unit}))`;
    return definition.id as string;
  }

  it("resolves a built-in metric in its starter unit to the starter metric, even in a workspace the migration never saw", async () => {
    const workspace = await newWorkspace();
    const [[main, guardrail]] = await resolveSavedMetrics(workspace, [plan({ key: "duration", unit: "seconds" }, [{ key: "events", unit: "count" }])]);
    expect(main).toMatchObject({ role: "primary", position: 0, savedName: "Median time to convert", definition: { name: "Median time to convert", unit: "seconds" } });
    expect(guardrail).toMatchObject({ role: "guardrail", position: 1, savedName: "Action count", definition: { name: "Action count", unit: "count" } });
  });

  it("resolves typed names whatever their case and spacing, and older units by their meaning", async () => {
    const workspace = await newWorkspace();
    await typedDefinition(workspace.orgId, "Trial starts", "percent");
    const legacy = { kind: "metric", metric: "  trial   STARTS ", baseline: 1, target: 2, unit: "%", source: "", reviewAfterDays: 30 };
    const [[metric]] = await resolveSavedMetrics(workspace, [legacy]);
    expect(metric).toMatchObject({ savedName: "trial   STARTS", definition: { name: "Trial starts", unit: "percent" } });
  });

  it("follows a merge to the kept definition and still resolves an archived one", async () => {
    const workspace = await newWorkspace();
    const kept = await typedDefinition(workspace.orgId, "Orders", "count");
    const merged = await typedDefinition(workspace.orgId, "Purchases", "count");
    const archived = await typedDefinition(workspace.orgId, "Refunds", "count");
    await connection`update metric_definitions set merged_into_id = ${kept} where id = ${merged}`;
    await connection`update metric_definitions set archived_at = now() where id = ${archived}`;
    const [[purchases, refunds]] = await resolveSavedMetrics(workspace, [plan({ key: "custom", name: "Purchases", unit: "count" }, [{ key: "custom", name: "Refunds", unit: "count" }])]);
    expect(purchases.definition).toMatchObject({ id: kept, name: "Orders" });
    expect(refunds.definition?.id).toBe(archived);
    expect(refunds.definition?.archivedAt).toBeInstanceOf(Date);
  });

  it("resolves nothing from another workspace's mapping, and nothing for a metric it has no mapping for", async () => {
    const mine = await newWorkspace();
    const theirs = await newWorkspace();
    await typedDefinition(theirs.orgId, "Orders", "count");
    const [[orders, conversions], [check]] = await resolveSavedMetrics(mine, [
      plan({ key: "custom", name: "Orders", unit: "count" }, [{ key: "conversion", unit: "count" }]),
      plan({ key: "check", unit: "", current: null, target: null, check: "keyboard" }),
    ]);
    expect(orders.definition).toBeNull();
    expect(conversions).toMatchObject({ savedName: "Conversions", definition: null });
    expect(check).toBeUndefined();
    expect(await resolveSavedMetrics(mine, [null, { kind: "no_measurable_impact", reason: "Ops" }])).toEqual([[], []]);
  });
});

describe("Metric definition history", () => {
  it("records each starter metric's creation by Lane", async () => {
    const workspace = await newWorkspace();
    const [conversion] = (await listMetricDefinitions(workspace)).filter(definition => definition.name === "Conversion rate");
    const history = await readMetricDefinitionHistory(workspace, conversion.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ revision: 1, kind: "created", before: null, authorId: null, after: { name: "Conversion rate", unit: "percent", link: null } });
    expect(history[0].createdAt).toBeInstanceOf(Date);
  });

  it("shows nothing of another workspace's definition", async () => {
    const mine = await newWorkspace();
    const theirs = await newWorkspace();
    const [theirDefinition] = await listMetricDefinitions(theirs);
    expect(await readMetricDefinitionHistory(mine, theirDefinition.id)).toEqual([]);
    expect(await readMetricDefinitionHistory(mine, "not-a-definition-id")).toEqual([]);
  });
});
