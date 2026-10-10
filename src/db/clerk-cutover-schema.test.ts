import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG_ID = "org_cutover_schema_probe";
const USER_ID = "user_cutover_schema_probe";
const REQUEST_ID = "00000000-0000-4000-a000-000000001401";
const OLD_TIMESTAMP = "2000-01-01T00:00:00.000Z";
const DOMAIN_TABLES = [
  "organizations",
  "profiles",
  "requests",
  "comments",
  "notifications",
  "request_attachments",
] as const;

let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
    throw new Error("Schema regression tests require local PostgreSQL");
  }
  connection = postgres(databaseUrl, { max: 1, prepare: false });

  await connection`
    insert into public.organizations (id, name, slug, updated_at)
    values (${ORG_ID}, 'Schema probe', 'cutover-schema-probe', ${OLD_TIMESTAMP})
  `;
  await connection`
    insert into public.profiles (id, full_name, email, updated_at)
    values (${USER_ID}, 'Schema probe', 'schema-probe@example.test', ${OLD_TIMESTAMP})
  `;
  await connection`
    insert into public.requests (id, org_id, title, description, created_by, updated_at)
    values (${REQUEST_ID}, ${ORG_ID}, 'Schema probe', 'Schema probe', ${USER_ID}, ${OLD_TIMESTAMP})
  `;
  await connection`
    insert into public.comments (request_id, author_id, body)
    values (${REQUEST_ID}, ${USER_ID}, 'Schema probe')
  `;
  await connection`
    insert into public.notifications (user_id, org_id, type, request_id, actor_id)
    values (${USER_ID}, ${ORG_ID}, 'comment_added', ${REQUEST_ID}, ${USER_ID})
  `;
  await connection`
    insert into public.request_attachments
      (id, org_id, request_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
    values
      ('00000000-0000-4000-a000-000000001402', ${ORG_ID}, ${REQUEST_ID}, ${USER_ID},
       'schema-probe/attachment', 'evidence.txt', 'text/plain', 10)
  `;
});

afterAll(async () => {
  if (!connection) return;
  await connection`delete from public.organizations where id = ${ORG_ID}`;
  await connection`delete from public.profiles where id = ${USER_ID}`;
  await connection.end();
});

describe("Clerk cutover preserves automatic domain timestamps", () => {
  // Removing any recreated table's trigger must fail its corresponding test.
  it.each([
    { table: "organizations", id: ORG_ID, column: "name", value: "Updated workspace" },
    { table: "profiles", id: USER_ID, column: "full_name", value: "Updated person" },
    { table: "requests", id: REQUEST_ID, column: "status", value: "in_progress" },
  ])("advances updated_at for $table on a normal update", async ({ table, id, column, value }) => {
    const [before] = await connection`
      select updated_at from ${connection(`public.${table}`)} where id = ${id}
    `;
    expect(before.updated_at.toISOString()).toBe(OLD_TIMESTAMP);

    const [updated] = await connection`
      update ${connection(`public.${table}`)}
      set ${connection(column)} = ${value}
      where id = ${id}
      returning updated_at, created_at
    `;

    expect(updated.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(updated.created_at.getTime());
  });
});

describe("Clerk domain tables stay closed to direct Data API clients", () => {
  for (const role of ["anon", "authenticated"] as const) {
    // Removing RLS from any table exposes its seeded row under this temporary
    // SELECT grant. Everything, including a role missing in CI, is rolled back.
    it.each(DOMAIN_TABLES)(`${role} cannot read %s even after an accidental grant`, async (table) => {
      const [control] = await connection`
        select count(*)::int as count from ${connection(`public.${table}`)}
      `;
      expect(control.count).toBeGreaterThan(0);

      const rollback = new Error("Roll back temporary direct-client grant");
      try {
        await connection.begin(async (transaction) => {
          const [existingRole] = await transaction`
            select 1 from pg_roles where rolname = ${role}
          `;
          if (!existingRole) {
            await transaction.unsafe(`create role ${role} nologin`);
          }
          await transaction.unsafe(`grant usage on schema public to ${role}`);
          await transaction.unsafe(`grant select on public.${table} to ${role}`);
          await transaction.unsafe(`set local role ${role}`);

          const rows = await transaction`
            select * from ${transaction(`public.${table}`)}
          `;
          expect(rows).toHaveLength(0);
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
    });
  }

  it("does not recreate permissive public policies", async () => {
    const policies = await connection`
      select tablename, policyname from pg_policies
      where schemaname = 'public' and tablename in ${connection(DOMAIN_TABLES)}
    `;
    expect(policies).toHaveLength(0);
  });
});
