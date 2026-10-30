import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0050 (#217): each person's first run, per workspace. Which guide they got (the workspace's first
 * person files a first Request; people who join later see their Inbox), the steps they've read, and whether they
 * skipped or finished it. Nothing else about the person or the workspace is stored.
 */
const ORG = "org_first_run_schema";
const OTHER = "org_first_run_schema_other";
const PERSON = "first_run_schema_person";
const TEAMMATE = "first_run_schema_teammate";
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'First run','first-run-schema'), (${OTHER},'Other','first-run-schema-other')`;
  await sql`insert into profiles(id,full_name,email) values (${PERSON},'Person','person@first-run.test'), (${TEAMMATE},'Teammate','teammate@first-run.test')`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG}, ${OTHER})`;
  await sql`delete from profiles where id in (${PERSON}, ${TEAMMATE})`;
  await sql.end();
});

describe("first-run progress", () => {
  it("keeps one first run per person per workspace, starting with nothing read", async () => {
    await sql`insert into first_run_progress(org_id,user_id,guide) values (${ORG},${PERSON},'first_request')`;
    await expect(sql`insert into first_run_progress(org_id,user_id,guide) values (${ORG},${PERSON},'joined')`).rejects.toMatchObject({ code: "23505" });
    await sql`insert into first_run_progress(org_id,user_id,guide) values (${ORG},${TEAMMATE},'joined'), (${OTHER},${PERSON},'joined')`;
    expect(await sql`select org_id, user_id, guide, steps, skipped_at, completed_at from first_run_progress where org_id in (${ORG},${OTHER}) order by org_id, user_id`).toEqual([
      { org_id: ORG, user_id: PERSON, guide: "first_request", steps: [], skipped_at: null, completed_at: null },
      { org_id: ORG, user_id: TEAMMATE, guide: "joined", steps: [], skipped_at: null, completed_at: null },
      { org_id: OTHER, user_id: PERSON, guide: "joined", steps: [], skipped_at: null, completed_at: null },
    ]);
  });

  it("knows only the two guides", async () => {
    await expect(sql`update first_run_progress set guide='demo' where org_id=${ORG} and user_id=${PERSON}`).rejects.toMatchObject({ code: "23514" });
  });

  it("records only the guides' own steps", async () => {
    await sql`update first_run_progress set steps=array['framing','prediction','reviewers','free_requests','release'] where org_id=${ORG} and user_id=${PERSON}`;
    await sql`update first_run_progress set steps=array['inbox'] where org_id=${ORG} and user_id=${TEAMMATE}`;
    await expect(sql`update first_run_progress set steps=array['framing','sample_data'] where org_id=${ORG} and user_id=${PERSON}`).rejects.toMatchObject({ code: "23514" });
    await expect(sql`update first_run_progress set steps=null where org_id=${ORG} and user_id=${PERSON}`).rejects.toMatchObject({ code: "23502" });
  });

  it("goes with its workspace and with its person", async () => {
    await sql`delete from organizations where id=${OTHER}`;
    expect(await sql`select org_id from first_run_progress where user_id=${PERSON} order by org_id`).toEqual([{ org_id: ORG }]);
    await sql`insert into organizations(id,name,slug) values (${OTHER},'Other','first-run-schema-other')`;
    await sql`delete from profiles where id=${TEAMMATE}`;
    expect(await sql`select user_id from first_run_progress where org_id=${ORG}`).toEqual([{ user_id: PERSON }]);
    await sql`insert into profiles(id,full_name,email) values (${TEAMMATE},'Teammate','teammate@first-run.test')`;
  });

  it("is closed to every database role but the app's", async () => {
    expect(await sql`select relrowsecurity from pg_class where relname='first_run_progress'`).toEqual([{ relrowsecurity: true }]);
    expect(await sql`select grantee from information_schema.role_table_grants where table_name='first_run_progress' and grantee in ('PUBLIC','anon','authenticated')`).toEqual([]);
  });
});
