import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0051 (#218): Same problem groups. One table records which group a Request is in (one group at most);
 * a second keeps each Request's history of links added and removed. A group never spans workspaces, and a group
 * left with one Request is no group at all.
 */
const ORG = "org_same_problem_schema";
const OTHER = "org_same_problem_schema_other";
const PERSON = "same_problem_schema_person";
let sql: ReturnType<typeof postgres>;

async function request(org: string, title: string): Promise<string> {
  const [{ id }] = await sql`insert into requests (org_id,title,description,created_by) values (${org},${title},'A problem',${PERSON}) returning id`;
  return id;
}
async function join(org: string, requestId: string, groupId: string) {
  await sql`insert into same_problem_members (org_id,request_id,group_id,added_by) values (${org},${requestId},${groupId},${PERSON})`;
}
const membersOf = async (groupId: string) =>
  (await sql`select request_id from same_problem_members where group_id = ${groupId} order by request_id`).map(row => row.request_id);
const sortIds = (ids: string[]) => [...ids].sort();

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Same problem','same-problem-schema'), (${OTHER},'Other','same-problem-schema-other')`;
  await sql`insert into profiles(id,full_name,email) values (${PERSON},'Person','person@same-problem.test')`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG}, ${OTHER})`;
  await sql`delete from profiles where id = ${PERSON}`;
  await sql.end();
});

describe("Same problem groups", () => {
  it("keeps a Request in one group at most", async () => {
    const [a, b] = [await request(ORG, "First try"), await request(ORG, "Second try")];
    const group = crypto.randomUUID();
    await join(ORG, a, group);
    await join(ORG, b, group);
    await expect(join(ORG, a, crypto.randomUUID())).rejects.toMatchObject({ code: "23505" });
    expect(await membersOf(group)).toEqual(sortIds([a, b]));
  });

  it("only groups Requests of its own workspace", async () => {
    const [a, b] = [await request(ORG, "Here"), await request(ORG, "Also here")];
    const elsewhere = await request(OTHER, "Elsewhere");
    // The Request must be the workspace's own.
    await expect(join(ORG, elsewhere, crypto.randomUUID())).rejects.toMatchObject({ code: "23503" });
    // And a group can't take a Request from another workspace.
    const group = crypto.randomUUID();
    await join(ORG, a, group);
    await join(ORG, b, group);
    await expect(join(OTHER, elsewhere, group)).rejects.toThrow("Same problem groups stay inside one workspace");
    expect(await membersOf(group)).toEqual(sortIds([a, b]));
  });

  it("ends a group left with one Request, when one is deleted or moved out", async () => {
    const [a, b, c] = [await request(ORG, "One"), await request(ORG, "Two"), await request(ORG, "Three")];
    const group = crypto.randomUUID();
    for (const id of [a, b, c]) await join(ORG, id, group);
    await sql`delete from requests where id = ${c}`;
    expect(await membersOf(group)).toEqual(sortIds([a, b]));
    await sql`delete from same_problem_members where request_id = ${b}`;
    expect(await membersOf(group)).toEqual([]);

    const [d, e, f] = [await request(ORG, "Four"), await request(ORG, "Five"), await request(ORG, "Six")];
    const [left, right] = [crypto.randomUUID(), crypto.randomUUID()];
    await join(ORG, d, left);
    await join(ORG, e, left);
    await join(ORG, f, right);
    await join(ORG, a, right);
    // Combining moves one group's Requests into the other; nothing is left behind.
    await sql`update same_problem_members set group_id = ${left} where group_id = ${right}`;
    expect(await membersOf(left)).toEqual(sortIds([d, e, f, a]));
    expect(await membersOf(right)).toEqual([]);
  });
});

describe("Same problem link history", () => {
  async function event(requestId: string, kind: string, other: { id: string; number: number } | null) {
    return sql`insert into same_problem_events (org_id,request_id,kind,other_request_id,other_request_number,actor_id)
      values (${ORG},${requestId},${kind},${other?.id ?? null},${other?.number ?? null},${PERSON}) returning id`;
  }

  it("records links added with the Request they joined, and links removed", async () => {
    const [a, b] = [await request(ORG, "Linked"), await request(ORG, "Linked too")];
    const [{ request_number: number }] = await sql`select request_number from requests where id = ${b}`;
    await event(a, "linked", { id: b, number });
    await event(a, "removed", null);
    await event(b, "removed", { id: a, number: 1 });
    await expect(event(a, "linked", null)).rejects.toMatchObject({ code: "23514" });
    await expect(event(a, "merged", null)).rejects.toMatchObject({ code: "23514" });
    await expect(sql`insert into same_problem_events (org_id,request_id,kind,actor_id) values (${OTHER},${a},'removed',${PERSON})`).rejects.toMatchObject({ code: "23503" });
    expect(await sql`select kind, other_request_id, actor_id from same_problem_events where request_id = ${a} order by created_at, kind`).toEqual([
      { kind: "linked", other_request_id: b, actor_id: PERSON },
      { kind: "removed", other_request_id: null, actor_id: PERSON },
    ]);
  });

  it("is never edited, and kept while its Request exists", async () => {
    const a = await request(ORG, "Kept");
    await event(a, "removed", null);
    await expect(sql`update same_problem_events set actor_id = 'someone' where request_id = ${a}`).rejects.toThrow("immutable");
    await expect(sql`delete from same_problem_events where request_id = ${a}`).rejects.toThrow("kept");
    await sql`delete from requests where id = ${a}`;
    expect(await sql`select id from same_problem_events where request_id = ${a}`).toEqual([]);
  });

  it("is closed to every database role but the app's", async () => {
    for (const table of ["same_problem_members", "same_problem_events"]) {
      expect(await sql`select relrowsecurity from pg_class where relname=${table}`).toEqual([{ relrowsecurity: true }]);
      expect(await sql`select grantee from information_schema.role_table_grants where table_name=${table} and grantee in ('PUBLIC','anon','authenticated')`).toEqual([]);
    }
  });
});
