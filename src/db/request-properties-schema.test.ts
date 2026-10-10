import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG_A = "org_request_properties_schema_a";
const ORG_B = "org_request_properties_schema_b";
const USER = "user_request_properties_schema";
const PROJECT_A = "00000000-0000-4000-a000-000000001501";
const PROJECT_B = "00000000-0000-4000-a000-000000001502";
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
    throw new Error("Project schema tests require disposable local PostgreSQL");
  }
  connection = postgres(databaseUrl, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG_A},'Schema A','request-properties-schema-a'), (${ORG_B},'Schema B','request-properties-schema-b')`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Schema probe','request-properties@example.test')`;
  await connection`insert into projects (id,org_id,name,created_by) values (${PROJECT_A},${ORG_A},'Website',${USER}), (${PROJECT_B},${ORG_B},'Website',${USER})`;
});

afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG_A},${ORG_B})`;
  await connection`delete from profiles where id = ${USER}`;
  await connection.end();
});

describe("Project database boundaries", () => {
  it("rejects case-insensitive duplicate names inside one workspace", async () => {
    await expect(connection`insert into projects (org_id,name,created_by) values (${ORG_A},'website',${USER})`).rejects.toMatchObject({ code: "23505" });
  });
  it("allows the same project name in separate workspaces", async () => {
    const rows = await connection`select org_id from projects where id in (${PROJECT_A},${PROJECT_B}) order by org_id`;
    expect(rows.map((row) => row.org_id)).toEqual([ORG_A, ORG_B]);
  });
  it("rejects untrimmed names and descriptions beyond the supported limit", async () => {
    await expect(connection`insert into projects (org_id,name,created_by) values (${ORG_A},' Extra ',${USER})`).rejects.toMatchObject({ code: "23514" });
    await expect(connection`insert into projects (org_id,name,description,created_by) values (${ORG_A},'Extra',${"x".repeat(301)},${USER})`).rejects.toMatchObject({ code: "23514" });
  });
  it("prevents a request referencing a project from another workspace", async () => {
    await expect(connection`insert into requests (org_id,title,description,created_by,project_id) values (${ORG_A},'Request','Description',${USER},${PROJECT_B})`).rejects.toMatchObject({ code: "23503" });
  });
  it("preserves nullable properties for requests without a selection", async () => {
    const [row] = await connection`insert into requests (org_id,title,description,created_by) values (${ORG_A},'Request','Description',${USER}) returning project_id,request_type`;
    expect(row).toEqual({ project_id: null, request_type: null });
  });
  it("persists valid metadata and rejects arbitrary request types", async () => {
    const [row] = await connection`insert into requests (org_id,title,description,created_by,project_id,request_type) values (${ORG_A},'Request','Description',${USER},${PROJECT_A},'improvement') returning project_id,request_type`;
    expect(row).toEqual({ project_id: PROJECT_A, request_type: "improvement" });
    await expect(connection`insert into requests (org_id,title,description,created_by,request_type) values (${ORG_A},'Request','Description',${USER},'urgent')`).rejects.toMatchObject({ code: "22P02" });
  });
  it.each(["anon", "authenticated"])("keeps Projects hidden from %s after an accidental grant", async (role) => {
    const rollback = new Error("Rollback temporary Data API grant");
    try {
      await connection.begin(async (transaction) => {
        const [existingRole] = await transaction`select 1 from pg_roles where rolname = ${role}`;
        if (!existingRole) await transaction.unsafe(`create role ${role} nologin`);
        await transaction.unsafe(`grant usage on schema public to ${role}`);
        await transaction.unsafe(`grant select on public.projects to ${role}`);
        await transaction.unsafe(`set local role ${role}`);
        expect(await transaction`select * from public.projects`).toHaveLength(0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
