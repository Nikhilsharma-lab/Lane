import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMetricDefinitions } from "@/lib/metrics-library";
import { loadWorkspaceSearch } from "./search";

const ORG = "org_measurement_search", OTHER = "org_measurement_search_other";
const OWNER = "user_measurement_search_owner", GUEST = "user_measurement_search_guest";
const base = {
  kind: "measurement", version: 2,
  primary: { key: "conversion", name: "", unit: "percent", current: 50, target: null, noBaseline: false, check: "" },
  measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" }, guardrails: [],
};
let connection: ReturnType<typeof postgres>;
const ids: string[] = [];
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations(id,name,slug) values (${ORG},'Measurement search','measurement-search'),(${OTHER},'Other','measurement-search-other')`;
  for (const user of [OWNER, GUEST]) await connection`insert into profiles(id,full_name,email) values(${user},'Search',${user + '@example.test'})`;
  const snapshots = [
    base,
    { ...base, primary: { ...base.primary, key: "custom", name: "Completed orders", unit: "count" }, guardrails: [
      { key: "support", name: "", unit: "percent", current: 1, noBaseline: false, operator: "at_most", limit: 5 },
      { key: "custom", name: 'Failed payments "card"', unit: "count", current: 0, noBaseline: false, operator: "at_most", limit: 10 },
    ] },
    { ...base, primary: { ...base.primary, key: "check", unit: "", current: null, check: "keyboard" } },
    { kind: "metric", metric: "Legacy outcome", baseline: 1, target: 2, unit: "orders", source: "Legacy source", reviewAfterDays: 30 },
    { ...base, primary: { ...base.primary, unit: "count" } },
  ];
  // #198: a v5 prediction names Metric definitions and keeps their names.
  const definition = async (name: string, unit: string) => (await connection`insert into metric_definitions(org_id,name,unit,created_by) values(${ORG},${name},${unit},${OWNER}) returning id`)[0].id;
  snapshots.push({ ...base, version: 5,
    primary: { ...base.primary, key: "definition", definitionId: await definition("Trial starts", "count"), name: "Trial starts", unit: "count" },
    guardrails: [{ key: "definition", definitionId: await definition("Refund requests", "count"), name: "Refund requests", unit: "count", current: 0, noBaseline: false, operator: "at_most", limit: 10 }] } as never);
  for (const snapshot of snapshots) {
    const [row] = await connection`insert into requests(org_id,title,description,created_by,expected_impact) values(${ORG},'Request','Plain description',${OWNER},${connection.json(snapshot)}) returning id`;
    ids.push(row.id);
  }
  await connection`insert into requests(org_id,title,description,created_by,expected_impact) values(${OTHER},'Request','Plain description',${OWNER},${connection.json(base)})`;
  // #201: the workspace's library, as migration 0038 left it: the starter metrics, plus a definition for each older
  // metric that isn't a starter in its unit (here the count variant of Conversion rate and one typed metric).
  await listMetricDefinitions({ orgId: ORG });
  const alias = async (definitionId: string, builtinKey: string | null, typedName: string | null, unit: string) =>
    connection`insert into metric_definition_aliases(org_id,definition_id,builtin_key,typed_name,unit) values(${ORG},${definitionId},${builtinKey},${typedName},${unit})`;
  await alias(await definition("Conversions", "count"), "conversion", null, "count");
  await alias(await definition("Orders completed", "count"), null, "completed orders", "count");
  defined = (name) => connection`update metric_definitions set name = ${name.to} where org_id = ${ORG} and name = ${name.from}`;
});
let defined: (name: { from: string; to: string }) => Promise<unknown>;
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG},${OTHER})`;
  await connection`delete from profiles where id in (${OWNER},${GUEST})`;
  await connection.end();
});
async function search(query: string, guest = false) {
  return loadWorkspaceSearch({ userId: guest ? GUEST : OWNER, orgId: ORG, role: guest ? "guest" : "member" }, { query, requestsPage: 0, projectsPage: 0 });
}
describe("measurement search on saved Request data", () => {
  it.each([["conversion rate", 0], ["completed orders", 1], ["orders completed", 1],["support contact rate", 1], ["failed payments", 1], ['payments "card"', 1], ["keyboard navigation", 2], ["legacy outcome", 3], ["conversions", 4], ["trial starts", 5], ["refund requests", 5]])("finds %s within the active workspace", async (query, index) => {
    const result = await search(String(query));
    expect(result.requests.total).toBe(1);
    expect(result.requests.items.map(item => item.id)).toEqual([ids[Number(index)]]);
  });
  it("does not expose another submitter's measurement through guest results or totals", async () => {
    const result = await search("conversion rate", true);
    expect(result.requests).toMatchObject({ items: [], total: 0 });
  });
  it("keeps SQL-looking and wildcard query text literal", async () => {
    expect((await search("%' OR 1=1 --")).requests.total).toBe(0);
  });
});

describe("search by Metric definition names (#201)", () => {
  const found = async (query: string) => (await search(query)).requests.items.map(item => ids.indexOf(item.id));

  it("finds Requests by their definitions' current names, not the names they saved or the built-in labels", async () => {
    await defined({ from: "Trial starts", to: "Trials started" });
    await defined({ from: "Conversion rate", to: "Checkout conversion" });
    expect(await found("trials started")).toEqual([5]);
    expect(await found("trial starts")).toEqual([]);
    expect(await found("checkout conversion")).toEqual([0]);
    expect(await found("conversion rate")).toEqual([]);
  });

  it("finds a Request by the definition its metric was merged into, and by an archived definition's name", async () => {
    const [refunds] = await connection`insert into metric_definitions(org_id,name,unit,created_by) values(${ORG},'Refunds','count',${OWNER}) returning id`;
    await connection`update metric_definitions set merged_into_id = ${refunds.id}, archived_at = now() where org_id = ${ORG} and name = 'Refund requests'`;
    await connection`update metric_definitions set archived_at = now() where org_id = ${ORG} and name = 'Orders completed'`;
    expect(await found("refunds")).toEqual([5]);
    expect(await found("refund requests")).toEqual([]);
    expect(await found("orders completed")).toEqual([1]);
  });

  it("never matches through another workspace's definitions", async () => {
    const [zebra] = await connection`insert into metric_definitions(org_id,name,unit,created_by) values(${OTHER},'Zebra metric','percent',${OWNER}) returning id`;
    await connection`insert into metric_definition_aliases(org_id,definition_id,builtin_key,unit) values(${OTHER},${zebra.id},'conversion','percent')`;
    expect(await found("zebra metric")).toEqual([]);
  });
});
