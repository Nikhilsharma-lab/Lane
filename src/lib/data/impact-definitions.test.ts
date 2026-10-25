import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadImpactDashboard } from "./impact";

// #201: the Impact page totals results by the Metric definition each Request's metric resolves to now, through the
// Metrics library: a renamed definition shows its current name, an archived one still adds up, a merged one adds up
// with the one it was merged into, and two definitions with the same name never add up.
// Closed Requests can never be deleted, so each test has its own workspace and the rows stay until the next reset.
const ORGS = ["org_impact_definitions_a", "org_impact_definitions_b"];
const USER = "user_impact_definitions";
const NOW = new Date("2026-10-23T12:00:00.000Z");
let ORG = ORGS[0];
const auth = () => ({ userId: USER, orgId: ORG, role: "member" as const });
let connection: ReturnType<typeof postgres>;

const measurement = { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" };
const v4 = (key: string, unit: string) => ({
  kind: "measurement", version: 4, measurement, guardrails: [],
  primary: { key, name: "", unit, current: 100, target: 150, noBaseline: false, check: "" },
});
const v5 = (definitionId: string, name: string, unit: string) => ({
  kind: "measurement", version: 5, measurement, guardrails: [],
  primary: { key: "definition", definitionId, name, unit, current: 100, target: 150, noBaseline: false, check: "" },
});
const release = { exposureDate: "2026-08-10", audience: "All users", evidence: "Release note", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" };

let closures = 0;
/** A Request closed with `actual` measured against `plan` (its frozen expectation). */
async function closed(title: string, plan: unknown, actual: number) {
  closures++;
  const closure = {
    version: 1, kind: "measured", actorId: USER, ownerId: USER, closedAt: "2026-09-10T09:00:00.000Z",
    operationId: `6f1d2c3b-0000-4000-8000-${String(closures).padStart(12, "0")}`, fingerprint: "a".repeat(64),
    expected: plan, release, primary: { kind: "numeric", actual, unit: "count" }, guardrails: [],
    evidence: `Export ${title}`, observedFrom: "2026-08-10", observedTo: "2026-09-09", revision: 1,
  };
  await connection`insert into requests (org_id,title,description,status,created_by,expected_impact,outcome_closure)
    values (${ORG},${title},'Fixture','done',${USER},${connection.json(plan as never)},${connection.json(closure as never)})`;
}
const definition = async (name: string, unit = "count") =>
  (await connection`insert into metric_definitions (org_id,name,unit,created_by) values (${ORG},${name},${unit},${USER}) returning id`)[0].id as string;

async function lines() {
  const dashboard = await loadImpactDashboard(auth(), { now: NOW });
  return dashboard.wholeOrg!.lines.map(line => ({ metric: line.metric, unit: line.unit, titles: line.results.map(result => result.title).sort(), summed: line.summed }))
    .sort((a, b) => a.metric.localeCompare(b.metric) || a.titles[0].localeCompare(b.titles[0]));
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Impact definition tests require loopback lane_test");
  connection = postgres(url.toString(), { max: 1, prepare: false });
  for (const org of ORGS) await connection`insert into organizations (id,name,slug) values (${org},'Impact definitions',${org.replaceAll("_", "-")})`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Impact','impact-definitions@example.test')`;
});
afterAll(async () => {
  await connection?.end();
});

describe("Impact totals by Metric definition", () => {
  it("adds an older built-in plan and a v5 pick of the same starter metric together, under its current name", async () => {
    await closed("Built-in", v4("events", "count"), 130);
    await loadImpactDashboard(auth(), { now: NOW }); // the first read fills the starter metrics
    const [starter] = await connection`update metric_definitions set name = 'Checkout clicks' where org_id = ${ORG} and starter_key = 'events' returning id`;
    await closed("Picked", v5(starter.id, "Action count", "count"), 120);
    expect(await lines()).toEqual([{ metric: "Checkout clicks", unit: "count", titles: ["Built-in", "Picked"], summed: { count: 2, change: 50 } }]);
  });

  it("still adds up an archived definition, adds a merged one to the one it was merged into, and keeps same-named definitions apart", async () => {
    ORG = ORGS[1];
    const signups = await definition("Signups");
    const kept = await definition("Trials started");
    const duplicate = await definition("Trial starts");
    await closed("Signups before archive", v5(signups, "Signups", "count"), 110);
    await closed("Kept", v5(kept, "Trials started", "count"), 130);
    await closed("Duplicate", v5(duplicate, "Trial starts", "count"), 140);
    await connection`update metric_definitions set archived_at = now() where id = ${signups}`;
    await connection`update metric_definitions set merged_into_id = ${kept}, archived_at = now() where id = ${duplicate}`;
    // An active definition may take the archived one's name; it is a different metric.
    const newSignups = await definition("Signups");
    await closed("Signups after archive", v5(newSignups, "Signups", "count"), 105);
    expect(await lines()).toEqual([
      { metric: "Signups", unit: "count", titles: ["Signups after archive"], summed: { count: 1, change: 5 } },
      { metric: "Signups", unit: "count", titles: ["Signups before archive"], summed: { count: 1, change: 10 } },
      { metric: "Trials started", unit: "count", titles: ["Duplicate", "Kept"], summed: { count: 2, change: 70 } },
    ]);
  });
});
