/**
 * #213, migration 0046: the database's own rules for Free Requests. Every Request created in a workspace counts,
 * deleted ones too; a Guest submission counts once it is taken on, and only once. The count never goes down, an
 * allowance (a company domain or a personal email address) belongs to one workspace, and a workspace's allowance
 * decision is made once.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const [ORG, OTHER_ORG] = ["org_free_requests_schema", "org_free_requests_schema_b"];
const [MEMBER, GUEST] = ["fr_schema_member", "fr_schema_guest"];
const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  for (const id of [ORG, OTHER_ORG]) await connection`insert into organizations(id,name,slug) values (${id},'Free Requests schema',${id})`;
  for (const id of [MEMBER, GUEST]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`;
});
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER_ORG})`;
  await connection`delete from profiles where id in (${MEMBER}, ${GUEST})`;
  await connection.end();
});

const used = async (org = ORG) => (await connection`select free_requests_used from workspace_billing where org_id=${org}`)[0]?.free_requests_used ?? 0;
async function request(guest = false, org = ORG) {
  const [row] = await connection`insert into requests(org_id,title,description,created_by,guest_submission) values (${org},'Counted','A Request.',${guest ? GUEST : MEMBER},${guest}) returning id`;
  return row.id as string;
}

describe("counting Free Requests", () => {
  it("counts every Request created, and a deleted one stays counted", async () => {
    const before = await used();
    const id = await request();
    await request();
    expect(await used()).toBe(before + 2);
    await connection`delete from requests where id=${id}`;
    expect(await used()).toBe(before + 2);
  });

  it("counts a Guest submission once it is taken on, and only once", async () => {
    const before = await used();
    const id = await request(true);
    expect(await used()).toBe(before);
    await connection`update requests set title='Still waiting' where id=${id}`;
    expect(await used()).toBe(before);
    await connection`update requests set taken_on_by=${MEMBER}, taken_on_at=now() where id=${id}`;
    expect(await used()).toBe(before + 1);
    await connection`update requests set title='Taken on' where id=${id}`;
    expect(await used()).toBe(before + 1);
  });

  it("counts each workspace on its own", async () => {
    const [mine, theirs] = [await used(ORG), await used(OTHER_ORG)];
    await request(false, OTHER_ORG);
    expect([await used(ORG), await used(OTHER_ORG)]).toEqual([mine, theirs + 1]);
  });

  it("never lowers the count", async () => {
    await request();
    await expect(connection`update workspace_billing set free_requests_used = free_requests_used - 1 where org_id=${ORG}`).rejects.toMatchObject({ code: "23514" });
  });
});

describe("allowances", () => {
  it("gives a company domain or a personal email address to one workspace only", async () => {
    await connection`insert into free_request_allowances(allowance_key,kind,org_id) values ('schema-acme.example','company_domain',${ORG})`;
    await expect(connection`insert into free_request_allowances(allowance_key,kind,org_id) values ('schema-acme.example','company_domain',${OTHER_ORG})`).rejects.toMatchObject({ code: "23505" });
    await connection`insert into free_request_allowances(allowance_key,kind,org_id) values ('someone@gmail.com','personal_email',${OTHER_ORG})`;
  });

  it("refuses keys that aren't a lowercase domain or a personal email address", async () => {
    await expect(connection`insert into free_request_allowances(allowance_key,kind,org_id) values ('Acme.example','company_domain',${ORG})`).rejects.toMatchObject({ code: "23514" });
    await expect(connection`insert into free_request_allowances(allowance_key,kind,org_id) values ('a@acme.example','company_domain',${ORG})`).rejects.toMatchObject({ code: "23514" });
    await expect(connection`insert into free_request_allowances(allowance_key,kind,org_id) values ('gmail.com','personal_email',${ORG})`).rejects.toMatchObject({ code: "23514" });
  });

  it("decides a workspace's allowance once", async () => {
    await connection`update workspace_billing set allowance_key='schema-acme.example', holds_allowance=true where org_id=${ORG}`;
    await expect(connection`update workspace_billing set holds_allowance=false where org_id=${ORG}`).rejects.toThrow("decided once");
    await expect(connection`update workspace_billing set allowance_key=null, holds_allowance=null where org_id=${ORG}`).rejects.toThrow("decided once");
    await expect(connection`update workspace_billing set allowance_key='x.example' where org_id=${OTHER_ORG}`).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps plan state to free, paying or lapsed", async () => {
    await expect(connection`update workspace_billing set plan_state='trial' where org_id=${ORG}`).rejects.toMatchObject({ code: "23514" });
  });
});

it("counts what existing workspaces already filed: deleted Requests and taken-on Guest submissions, not waiting ones", async () => {
  const rows = await connection`select org_id, free_requests_used, plan_state, holds_allowance from workspace_billing where org_id like 'org_free_requests_backfill%' order by org_id`;
  expect(rows).toEqual([
    { org_id: "org_free_requests_backfill", free_requests_used: 4, plan_state: "free", holds_allowance: null },
    { org_id: "org_free_requests_backfill_empty", free_requests_used: 0, plan_state: "free", holds_allowance: null },
  ]);
});

it("turns row-level security on and leaves both tables closed to public roles", async () => {
  const tables = await connection`select relname, relrowsecurity from pg_class where relname in ('workspace_billing','free_request_allowances') order by relname`;
  expect(tables).toEqual([{ relname: "free_request_allowances", relrowsecurity: true }, { relname: "workspace_billing", relrowsecurity: true }]);
  const grants = await connection`select count(*)::int as n from information_schema.role_table_grants where table_name in ('workspace_billing','free_request_allowances') and grantee in ('PUBLIC','anon','authenticated')`;
  expect(grants[0].n).toBe(0);
});
