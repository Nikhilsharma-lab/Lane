import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Measurement search requires loopback lane_test");
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
  for (const snapshot of snapshots) {
    const [row] = await connection`insert into requests(org_id,title,description,created_by,expected_impact) values(${ORG},'Request','Plain description',${OWNER},${connection.json(snapshot)}) returning id`;
    ids.push(row.id);
  }
  await connection`insert into requests(org_id,title,description,created_by,expected_impact) values(${OTHER},'Request','Plain description',${OWNER},${connection.json(base)})`;
});
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
  it.each([["conversion rate", 0], ["completed orders", 1], ["support contact rate", 1], ["failed payments", 1], ['payments "card"', 1], ["keyboard navigation", 2], ["legacy outcome", 3], ["conversions", 4]])("finds %s within the active workspace", async (query, index) => {
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
