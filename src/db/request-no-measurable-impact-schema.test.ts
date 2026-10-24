import { requireTestDatabase } from "@/test/test-database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG = "org_no_measurable_impact";
const USER = "user_no_measurable_impact";
const metric = { kind: "metric", metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 };
const reason = "Design-system token rename with no user-facing change";
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'No measurable impact','no-measurable-impact')`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'No measurable impact','no-measurable-impact@example.test')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id = ${USER}`;
  await connection.end();
});

const insertRequest = (expected: unknown, chosenReason: string | null, draft: unknown = null) =>
  connection`insert into requests (org_id,title,description,created_by,expected_impact,no_measurable_impact_reason,measurement_draft)
    values (${ORG},'Operational','Token rename',${USER},${expected === null ? null : connection.json(expected as never)}::jsonb,${chosenReason},${draft === null ? null : connection.json(draft as never)}::jsonb)
    returning id, expected_impact, no_measurable_impact_reason`;
const revisionsOf = (requestId: string) =>
  connection`select revision, expected_impact, no_measurable_impact_reason, author_id, recorded_as from request_expected_impact_revisions where request_id = ${requestId} order by revision`;

describe("No measurable impact on a Request", () => {
  it("saves the choice with its reason and no measured plan", async () => {
    const [row] = await insertRequest(null, reason);
    expect(row).toMatchObject({ expected_impact: null, no_measurable_impact_reason: reason });
  });

  it("keeps a Request without the choice exactly as before", async () => {
    const [row] = await insertRequest(metric, null);
    expect(row).toMatchObject({ expected_impact: metric, no_measurable_impact_reason: null });
  });

  it.each(["", "   "])("refuses a blank reason (%j)", async (blank) => {
    await expect(insertRequest(null, blank)).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses the choice together with a measured plan", async () => {
    await expect(insertRequest(metric, reason)).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses the choice together with a saved draft", async () => {
    await expect(insertRequest(null, reason, { kind: "measurement" })).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a reason longer than the form allows", async () => {
    await expect(insertRequest(null, "x".repeat(1001))).rejects.toMatchObject({ code: "23514" });
  });
});

describe("No measurable impact in Expected impact history", () => {
  it("records the choice and its reason as revision 1 when the Request is created", async () => {
    const [row] = await insertRequest(null, reason);
    const [revision] = await revisionsOf(row.id);
    expect(revision).toMatchObject({ revision: 1, expected_impact: null, no_measurable_impact_reason: reason, author_id: USER, recorded_as: "created" });
  });

  it("refuses a revision that records neither a measured plan nor the choice", async () => {
    const [row] = await insertRequest(metric, null);
    await expect(connection`insert into request_expected_impact_revisions (org_id,request_id,revision,expected_impact,no_measurable_impact_reason,author_id,recorded_as) values (${ORG},${row.id},2,null,null,${USER},'revised')`).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a revision that records both a measured plan and the choice", async () => {
    const [row] = await insertRequest(metric, null);
    await expect(connection`insert into request_expected_impact_revisions (org_id,request_id,revision,expected_impact,no_measurable_impact_reason,author_id,recorded_as) values (${ORG},${row.id},2,${connection.json(metric)}::jsonb,${reason},${USER},'revised')`).rejects.toMatchObject({ code: "23514" });
  });

  it("accepts a revision that records the choice, and keeps the earlier plan readable", async () => {
    const [row] = await insertRequest(metric, null);
    await connection`insert into request_expected_impact_revisions (org_id,request_id,revision,expected_impact,no_measurable_impact_reason,author_id,recorded_as) values (${ORG},${row.id},2,null,${reason},${USER},'revised')`;
    const rows = await revisionsOf(row.id);
    expect(rows.map((item) => [item.revision, item.expected_impact === null, item.no_measurable_impact_reason])).toEqual([
      [1, false, null],
      [2, true, reason],
    ]);
  });
});
