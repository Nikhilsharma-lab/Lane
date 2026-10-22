import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG = "org_measurement_schema";
const USER = "user_measurement_schema";
const plan = {
  kind: "measurement", version: 2,
  primary: { key: "conversion", name: "", unit: "percent", current: null, target: null, noBaseline: false, check: "" },
  measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};
let connection: ReturnType<typeof postgres>;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Measurement schema tests require loopback lane_test");
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Measurement','measurement-schema')`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Measurement','measurement@example.test')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id=${ORG}`;
  await connection`delete from profiles where id=${USER}`;
  await connection.end();
});
async function insert(snapshot: unknown, requestType: string | null = null) {
  return connection`insert into requests (org_id,title,description,created_by,request_type,expected_impact) values (${ORG},'Measurement Request','Measurement contract',${USER},${requestType}::request_type,${connection.json(snapshot as Parameters<typeof connection.json>[0])}::jsonb) returning expected_impact`;
}
describe("versioned measurement database constraint", () => {
  it("round-trips unknown current values and optional goals without inventing legacy fields", async () => {
    const [row] = await insert(plan);
    expect(row.expected_impact).toEqual(plan);
  });
  it("retains multiple guardrails and exact dates", async () => {
    const snapshot = { ...plan, measurement: { ...plan.measurement, exactDates: true, startDate: "2028-02-29", endDate: "2028-03-01" }, guardrails: [
      { key: "error", name: "", unit: "percent", current: 1, noBaseline: false, operator: "at_most", limit: 2 },
      { key: "custom", name: "Orders", unit: "count", current: null, noBaseline: false, operator: "at_least", limit: 100 },
    ] };
    const [row] = await insert(snapshot);
    expect(row.expected_impact).toEqual(snapshot);
  });
  it("round-trips custom audience and platform names without weakening pickup readiness", async () => {
    const snapshot = { ...plan, measurement: { ...plan.measurement, audience: "custom", audienceName: "Enterprise customers", platform: "custom", platformName: "Desktop app" } };
    const [row] = await insert(snapshot);
    expect(row.expected_impact).toEqual(snapshot);
    const [missing] = await connection`select public.request_measurement_ready(${connection.json(snapshot)}, null) as ready`;
    expect(missing.ready).toBe(false);
    const [ready] = await connection`select public.request_measurement_ready(${connection.json({ ...snapshot, primary: { ...snapshot.primary, current: 0 } })}, null) as ready`;
    expect(ready.ready).toBe(true);
  });
  it.each([undefined, "", "\t\n", "x".repeat(101), 23, null])("rejects missing, blank, long or nontext custom scope names: %s", async (name) => {
    for (const scope of ["audience", "platform"] as const) {
      await expect(insert({ ...plan, measurement: { ...plan.measurement, [scope]: "custom", [`${scope}Name`]: name } })).rejects.toMatchObject({ code: "23514" });
    }
  });
  it("allows only explicit primary exceptions for new features", async () => {
    const snapshot = { ...plan, primary: { ...plan.primary, noBaseline: true } };
    await expect(insert(snapshot, "bug")).rejects.toMatchObject({ code: "23514" });
    await expect(insert(snapshot)).rejects.toMatchObject({ code: "23514" });
    await expect(insert(snapshot, "new_feature")).resolves.toHaveLength(1);
  });
  it.each([
    { ...plan, version: 1 }, { ...plan, primary: { ...plan.primary, key: "" } },
    { ...plan, primary: { ...plan.primary, current: 101 } },
    { ...plan, primary: { ...plan.primary, unit: "count", current: 1.5 } },
    { ...plan, primary: { ...plan.primary, unit: "seconds" } },
    { ...plan, primary: { ...plan.primary, key: "custom", name: " " } },
    { ...plan, primary: { ...plan.primary, key: "custom", name: "\t\n" } },
    { ...plan, primary: { ...plan.primary, noBaseline: true, current: 0 } },
    { ...plan, measurement: { ...plan.measurement, exactDates: true, startDate: "2026-02-29", endDate: "2026-03-01" } },
    { ...plan, measurement: { ...plan.measurement, exactDates: true, startDate: "2026-10-20", endDate: "2026-10-19" } },
    { ...plan, guardrails: [{ key: "support", name: "", unit: "percent", current: null, noBaseline: true, operator: "at_most", limit: 2 }] },
    { ...plan, guardrails: [{ key: "support", name: "", unit: "percent", current: null, noBaseline: false, operator: "at_most", limit: null }] },
  ])("rejects malformed new measurements %#", async (snapshot) => {
    await expect(insert(snapshot, "new_feature")).rejects.toMatchObject({ code: "23514" });
  });
  it("uses the same before-pickup predicate for zero, exceptions and missing guardrails", async () => {
    const snapshots = [plan, { ...plan, primary: { ...plan.primary, current: 0 } }, { ...plan, primary: { ...plan.primary, noBaseline: true } }];
    const actual = [];
    for (const snapshot of snapshots) {
      const [row] = await connection`select public.request_measurement_ready(${connection.json(snapshot)}::jsonb, 'new_feature') as ready`;
      actual.push(row.ready);
    }
    expect(actual).toEqual([false, true, true]);
    const [legacy] = await connection`select public.request_measurement_ready(null, null) as ready`;
    expect(legacy.ready).toBe(true);
  });
});

it.each(["less_than", "greater_than", "equal_to", "at_most", "at_least"])("round-trips v3 comparison %s and permits pickup without guardrail current values", async operator => {
  const snapshot = { ...plan, version: 3, primary: { ...plan.primary, current: 0 }, guardrails: [{ key: "error", name: "", unit: "percent", current: null, noBaseline: false, operator, limit: 5 }] };
  const [saved] = await insert(snapshot);
  expect(saved.expected_impact).toEqual(snapshot);
  const [ready] = await connection`select public.request_measurement_ready(${connection.json(snapshot)}, null) as ready`;
  expect(ready.ready).toBe(true);
  await expect(insert({ ...snapshot, guardrails: [{ ...snapshot.guardrails[0], operator: "approximately" }] })).rejects.toMatchObject({ code: "23514" });
});

it.each(["percent", "count", "minutes", "seconds"])("round-trips v4 %s for every numeric metric", async unit => {
  for (const key of ["conversion", "adoption", "error", "support", "csat", "duration", "events", "custom"]) {
    const snapshot = { ...plan, version: 4, primary: { ...plan.primary, key, name: "Custom", unit, current: 2 }, guardrails: [{ key, name: "Custom", unit, current: null, noBaseline: false, operator: "equal_to", limit: 3 }] };
    const [saved] = await insert(snapshot);
    expect(saved.expected_impact).toEqual(snapshot);
    await expect(insert({ ...snapshot, primary: { ...snapshot.primary, unit: "unknown" } })).rejects.toMatchObject({ code: "23514" });
  }
});
