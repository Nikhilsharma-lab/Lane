import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG = "org_expected_impact_history";
const USER = "user_expected_impact_history";
const CREATOR = "user_expected_impact_history_creator";
const metric = { kind: "metric", metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 };
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Impact history tests require disposable local PostgreSQL");
  connection = postgres(url, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Impact history','expected-impact-history')`;
  await connection`insert into profiles (id,full_name,email) values (${CREATOR},'Creator','expected-impact-creator@example.test'), (${USER},'Editor','expected-impact-editor@example.test')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id in (${CREATOR}, ${USER})`;
  await connection.end();
});

const insertRequest = async (impact: unknown) => {
  const [row] = await connection`insert into requests (org_id,title,description,created_by,expected_impact) values (${ORG},'History','Request',${CREATOR},${impact === null ? null : connection.json(impact as never)}::jsonb) returning id`;
  return row.id as string;
};
const revisionsOf = (requestId: string) => connection`select revision, expected_impact, author_id, recorded_as, created_at from request_expected_impact_revisions where request_id = ${requestId} order by revision`;

describe("Expected impact history on create", () => {
  it("records the first revision with the creator and the time it was saved", async () => {
    const id = await insertRequest(metric);
    const [revision] = await revisionsOf(id);
    expect(revision).toMatchObject({ revision: 1, expected_impact: metric, author_id: CREATOR, recorded_as: "created" });
    expect(revision.created_at).toBeInstanceOf(Date);
  });
  it("records nothing for a Request saved without an Expected impact", async () => {
    const id = await insertRequest(null);
    expect(await revisionsOf(id)).toHaveLength(0);
  });
});

describe("Expected impact history is kept", () => {
  it("refuses to change a recorded revision", async () => {
    const id = await insertRequest(metric);
    await expect(connection`update request_expected_impact_revisions set expected_impact = '{"kind":"metric"}'::jsonb where request_id = ${id}`).rejects.toThrow("immutable");
    const [revision] = await revisionsOf(id);
    expect(revision.expected_impact).toEqual(metric);
  });
  it("refuses to delete a revision while its Request exists", async () => {
    const id = await insertRequest(metric);
    await expect(connection`delete from request_expected_impact_revisions where request_id = ${id}`).rejects.toThrow("kept");
    expect(await revisionsOf(id)).toHaveLength(1);
  });
  it("keeps one row per revision number for each Request", async () => {
    const id = await insertRequest(metric);
    await expect(connection`insert into request_expected_impact_revisions (org_id,request_id,revision,expected_impact,author_id,recorded_as) values (${ORG},${id},1,${connection.json(metric)}::jsonb,${USER},'revised')`).rejects.toMatchObject({ code: "23505" });
  });
  it("removes a Request's history with the Request when it is deleted before pickup", async () => {
    const id = await insertRequest(metric);
    await connection`delete from requests where id = ${id}`;
    expect(await connection`select 1 from request_expected_impact_revisions where request_id = ${id}`).toHaveLength(0);
  });
});

describe("Expected impact history revisions", () => {
  it("accepts a later revision by a named author and keeps the earlier one readable", async () => {
    const id = await insertRequest(metric);
    const revised = { ...metric, target: 80 };
    await connection`insert into request_expected_impact_revisions (org_id,request_id,revision,expected_impact,author_id,recorded_as) values (${ORG},${id},2,${connection.json(revised)}::jsonb,${USER},'revised')`;
    const rows = await revisionsOf(id);
    expect(rows.map((row) => [row.revision, row.expected_impact.target, row.author_id, row.recorded_as])).toEqual([
      [1, 70, CREATOR, "created"],
      [2, 80, USER, "revised"],
    ]);
  });
  it("rejects a revision with an unknown recording kind or a non-object impact", async () => {
    const id = await insertRequest(metric);
    await expect(connection`insert into request_expected_impact_revisions (org_id,request_id,revision,expected_impact,author_id,recorded_as) values (${ORG},${id},2,${connection.json(metric)}::jsonb,${USER},'guessed')`).rejects.toMatchObject({ code: "23514" });
    await expect(connection`insert into request_expected_impact_revisions (org_id,request_id,revision,expected_impact,author_id,recorded_as) values (${ORG},${id},3,${connection.json("text")}::jsonb,${USER},'revised')`).rejects.toMatchObject({ code: "23514" });
  });
});

describe("Expected impact history backfill", () => {
  // Legacy rows are seeded by src/test/expected-impact-history-fixtures.sql before migration 0035 runs.
  it("gives each existing Request's current impact revision 1, marked backfilled, and nothing for a Request without one", async () => {
    const rows = await connection`
      select r.id, r.expected_impact is not null as has_impact, h.revision, h.recorded_as, h.author_id, h.expected_impact as history_impact
      from requests r left join request_expected_impact_revisions h on h.request_id = r.id
      where r.org_id = 'org_expected_history_legacy' order by r.title, h.revision`;
    const withImpact = rows.filter((row) => row.has_impact);
    const without = rows.filter((row) => !row.has_impact);
    expect(withImpact.length).toBeGreaterThan(0);
    expect(withImpact.every((row) => row.revision === 1 && row.recorded_as === "backfilled" && row.author_id === "user_test_admin_a")).toBe(true);
    expect(without.every((row) => row.revision === null)).toBe(true);
  });
});
