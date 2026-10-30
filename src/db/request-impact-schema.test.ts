import { requireTestDatabase } from "@/test/test-database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG = "org_expected_impact_schema";
const USER = "user_expected_impact_schema";
const metric = { kind: "metric", metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 };
const verification = { kind: "verification", result: "Complete signup with keyboard alone", source: "Released flow acceptance check", reviewAfterDays: 7 };
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Impact schema','expected-impact-schema')`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Impact schema','expected-impact@example.test')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id = ${USER}`;
  await connection.end();
});

describe("Expected impact database constraint", () => {
  it("keeps legacy requests readable with a null snapshot", async () => {
    const [row] = await connection`insert into requests (org_id,title,description,created_by) values (${ORG},'Legacy','Existing Request',${USER}) returning expected_impact`;
    expect(row.expected_impact).toBeNull();
  });
  it.each([metric, verification])("persists a complete $kind snapshot", async (impact) => {
    const [row] = await connection`insert into requests (org_id,title,description,created_by,expected_impact) values (${ORG},'Expected impact','New Request',${USER},${connection.json(impact)}::jsonb) returning expected_impact`;
    expect(row.expected_impact).toEqual(impact);
  });
  it.each([metric, verification])("persists $kind impact without requiring a source", async (impact) => {
    const withoutSource = Object.fromEntries(Object.entries(impact).filter(([key]) => key !== "source"));
    for (const snapshot of [withoutSource, { ...impact, source: "" }, { ...impact, source: " " }, { ...impact, source: "a".repeat(1000) }]) {
      const [row] = await connection`insert into requests (org_id,title,description,created_by,expected_impact) values (${ORG},'Optional source','New Request',${USER},${connection.json(snapshot)}::jsonb) returning expected_impact`;
      expect(row.expected_impact).toEqual(snapshot);
    }
  });
  it.each([metric, verification])("retains the existing trimmed source limit for $kind impact", async (impact) => {
    const snapshot = { ...impact, source: ` ${"a".repeat(1000)} ` };
    const [row] = await connection`insert into requests (org_id,title,description,created_by,expected_impact) values (${ORG},'Existing source','New Request',${USER},${connection.json(snapshot)}::jsonb) returning expected_impact`;
    expect(row.expected_impact).toEqual(snapshot);
  });
  it.each([metric, verification])("round-trips an optional guardrail on $kind without changing the existing constraint", async (impact) => {
    const snapshot = { ...impact, guardrail: { metric: "Error rate", operator: "at_most", limit: 2, unit: "%" } };
    const [row] = await connection`insert into requests (org_id,title,description,created_by,expected_impact) values (${ORG},'Guarded impact','New Request',${USER},${connection.json(snapshot)}::jsonb) returning expected_impact`;
    expect(row.expected_impact).toEqual(snapshot);
  });
  it.each([
    {}, [], "invalid", { ...metric, kind: "prediction" },
    { ...metric, target: "70" }, { ...metric, target: null },
    { ...metric, baseline: "unknown" },
    { ...metric, source: null }, { ...metric, source: 123 },
    { ...metric, source: "a".repeat(1001) }, { ...verification, source: [] },
    { ...metric, metric: " " }, { ...metric, unit: " " },
    { ...metric, reviewAfterDays: 0 }, { ...metric, reviewAfterDays: 3651 },
    { ...metric, reviewAfterDays: 7.5 }, { ...metric, reviewAfterDays: "30" },
    { ...verification, result: " " },
  ])("rejects malformed impact %#", async (impact) => {
    await expect(connection`insert into requests (org_id,title,description,created_by,expected_impact) values (${ORG},'Expected impact','New Request',${USER},${connection.json(impact)}::jsonb)`).rejects.toMatchObject({ code: "23514" });
  });
});
