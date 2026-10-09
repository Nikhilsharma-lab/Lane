import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG = "org_expected_impact_schema";
const USER = "user_expected_impact_schema";
const metric = { kind: "metric", metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 };
const verification = { kind: "verification", result: "Complete signup with keyboard alone", source: "Released flow acceptance check", reviewAfterDays: 7 };
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Impact schema tests require disposable local PostgreSQL");
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
  it.each([
    {}, [], "invalid", { ...metric, kind: "prediction" },
    { ...metric, target: "70" }, { ...metric, target: null },
    { ...metric, baseline: "unknown" },
    { ...metric, source: null }, { ...metric, source: " " },
    { ...metric, metric: " " }, { ...metric, unit: " " },
    { ...metric, reviewAfterDays: 0 }, { ...metric, reviewAfterDays: 3651 },
    { ...metric, reviewAfterDays: 7.5 }, { ...metric, reviewAfterDays: "30" },
    { ...verification, result: " " },
  ])("rejects malformed impact %#", async (impact) => {
    await expect(connection`insert into requests (org_id,title,description,created_by,expected_impact) values (${ORG},'Expected impact','New Request',${USER},${connection.json(impact)}::jsonb)`).rejects.toMatchObject({ code: "23514" });
  });
});
