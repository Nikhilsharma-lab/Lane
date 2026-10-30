import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0052 (#219): saved views. Each one is a person's own: a name and the Requests list filters it reopens
 * (status and Project today). Nothing in it is shared, and it holds filters only, never Requests.
 */
const ORG = "org_saved_views_schema";
const OTHER = "org_saved_views_schema_other";
const PERSON = "saved_views_schema_person";
const TEAMMATE = "saved_views_schema_teammate";
let sql: ReturnType<typeof postgres>;

const save = (orgId: string, ownerId: string, name: string, filters: unknown = { status: "open", project: "all" }) =>
  sql`insert into saved_views(org_id, owner_id, name, filters) values (${orgId}, ${ownerId}, ${name}, ${sql.json(filters as never)}::jsonb) returning id`;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Saved views','saved-views-schema'), (${OTHER},'Other','saved-views-schema-other')`;
  await sql`insert into profiles(id,full_name,email) values (${PERSON},'Person','person@saved-views.test'), (${TEAMMATE},'Teammate','teammate@saved-views.test')`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG}, ${OTHER})`;
  await sql`delete from profiles where id in (${PERSON}, ${TEAMMATE})`;
  await sql.end();
});

describe("saved views", () => {
  it("keeps a person's views per workspace, with their name and filters", async () => {
    await save(ORG, PERSON, "Open work");
    await save(ORG, TEAMMATE, "Open work");
    await save(OTHER, PERSON, "Open work", { status: "closed", project: "none" });
    expect(await sql`select org_id, owner_id, name, filters from saved_views where org_id in (${ORG}, ${OTHER}) order by org_id, owner_id`).toEqual([
      { org_id: ORG, owner_id: PERSON, name: "Open work", filters: { status: "open", project: "all" } },
      { org_id: ORG, owner_id: TEAMMATE, name: "Open work", filters: { status: "open", project: "all" } },
      { org_id: OTHER, owner_id: PERSON, name: "Open work", filters: { status: "closed", project: "none" } },
    ]);
  });

  it("gives one person one view of each name in a workspace, ignoring case", async () => {
    await expect(save(ORG, PERSON, "open WORK")).rejects.toMatchObject({ code: "23505" });
  });

  it("needs a trimmed name of 1 to 60 characters", async () => {
    await expect(save(ORG, PERSON, "")).rejects.toMatchObject({ code: "23514" });
    await expect(save(ORG, PERSON, " Padded ")).rejects.toMatchObject({ code: "23514" });
    await expect(save(ORG, PERSON, "x".repeat(61))).rejects.toMatchObject({ code: "23514" });
    await save(ORG, PERSON, "x".repeat(60));
  });

  it("stores filters as one object", async () => {
    await expect(save(ORG, PERSON, "A list", ["open"])).rejects.toMatchObject({ code: "23514" });
    await expect(save(ORG, PERSON, "A string", "open")).rejects.toMatchObject({ code: "23514" });
  });

  it("records when a view was last changed", async () => {
    const [{ id }] = await sql`insert into saved_views(org_id, owner_id, name, updated_at) values (${ORG}, ${PERSON}, 'Measuring', '2026-01-01T00:00:00Z') returning id`;
    await sql`update saved_views set name = 'Measuring now' where id = ${id}`;
    const [after] = await sql`select updated_at from saved_views where id = ${id}`;
    expect(after.updated_at.getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00Z").getTime());
  });

  it("goes with its workspace and with its person", async () => {
    await sql`delete from organizations where id=${OTHER}`;
    expect(await sql`select distinct org_id from saved_views where owner_id=${PERSON}`).toEqual([{ org_id: ORG }]);
    await sql`insert into organizations(id,name,slug) values (${OTHER},'Other','saved-views-schema-other')`;
    await sql`delete from profiles where id=${TEAMMATE}`;
    expect(await sql`select distinct owner_id from saved_views where org_id=${ORG}`).toEqual([{ owner_id: PERSON }]);
    await sql`insert into profiles(id,full_name,email) values (${TEAMMATE},'Teammate','teammate@saved-views.test')`;
  });

  it("is closed to every database role but the app's", async () => {
    expect(await sql`select relrowsecurity from pg_class where relname='saved_views'`).toEqual([{ relrowsecurity: true }]);
    expect(await sql`select grantee from information_schema.role_table_grants where table_name='saved_views' and grantee in ('PUBLIC','anon','authenticated')`).toEqual([]);
  });
});
