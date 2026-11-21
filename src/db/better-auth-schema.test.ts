import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { migrationPlan } from "@/test/migration-plan";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0055 (#370, spec #369): what Better Auth needs, added beside the Clerk build. Six new tables and new
 * columns on profiles and organizations, nothing dropped or rewritten, every new table closed to Supabase's Data API.
 */
const BETTER_AUTH_TABLES = ["session", "account", "verification", "member", "invitation", "rate_limit"] as const;
const ORG = "org_better_auth_schema";
const PERSON = "better_auth_schema_person";
const PERSON_EMAIL = "person@better-auth-schema.test";

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
  // Shaped as the Clerk build writes them: none of 0055's columns given.
  await sql`insert into organizations (id, name, slug) values (${ORG}, 'Better Auth schema', 'better-auth-schema')`;
  await sql`
    insert into profiles (id, full_name, email, role, avatar_url)
    values (${PERSON}, 'Person', ${PERSON_EMAIL}, 'pm', 'https://img.clerk.com/person.png')
  `;
});
afterAll(async () => {
  if (!sql) return;
  await sql`delete from organizations where id like 'org_better_auth_schema%'`;
  await sql`delete from profiles where id like 'better_auth_schema_%'`;
  await sql.end();
});

describe("the Clerk build's writes", () => {
  it("still succeed, and the new columns start empty or unverified", async () => {
    expect(await sql`
      select email_verified, image, last_workspace_id, avatar_url from profiles where id = ${PERSON}
    `).toEqual([{
      email_verified: false, image: null, last_workspace_id: null, avatar_url: "https://img.clerk.com/person.png",
    }]);
    expect(await sql`select logo, metadata from organizations where id = ${ORG}`).toEqual([{ logo: null, metadata: null }]);
  });

  it("refuse a second profile with the same email", async () => {
    await expect(sql`
      insert into profiles (id, full_name, email) values ('better_auth_schema_twin', 'Twin', ${PERSON_EMAIL})
    `).rejects.toMatchObject({ code: "23505" });
  });
});

const NOW = new Date("2026-11-21T12:00:00Z");
const LATER = new Date("2026-11-28T12:00:00Z");

/** A person with a session, a password account and a membership, as Better Auth writes them. */
async function signedUpMember(id: string, orgId: string) {
  await sql`insert into profiles (id, full_name, email) values (${id}, ${id}, ${`${id}@better-auth-schema.test`})`;
  await sql`
    insert into session (id, expires_at, token, updated_at, user_id, active_organization_id)
    values (${`${id}_session`}, ${LATER}, ${`${id}_token`}, ${NOW}, ${id}, ${orgId})
  `;
  await sql`
    insert into account (id, account_id, provider_id, user_id, password, updated_at)
    values (${`${id}_account`}, ${id}, 'credential', ${id}, 'scrypt-hash', ${NOW})
  `;
  await sql`
    insert into member (id, organization_id, user_id, role, created_at)
    values (${`${id}_member`}, ${orgId}, ${id}, 'admin', ${NOW})
  `;
}

const invite = (id: string, orgId: string, inviterId: string) => sql`
  insert into invitation (id, organization_id, email, role, expires_at, inviter_id)
  values (${id}, ${orgId}, 'invited@better-auth-schema.test', 'member', ${LATER}, ${inviterId})
`;

describe("what goes with a person", () => {
  it("deleting a profile deletes its sessions, accounts, memberships and the invitations it sent", async () => {
    const leaver = "better_auth_schema_leaver";
    await signedUpMember(leaver, ORG);
    await invite("better_auth_schema_invite_from_leaver", ORG, leaver);

    await sql`delete from profiles where id = ${leaver}`;

    expect(await sql`
      select
        (select count(*)::int from session where user_id = ${leaver}) as sessions,
        (select count(*)::int from account where user_id = ${leaver}) as accounts,
        (select count(*)::int from member where user_id = ${leaver}) as members,
        (select count(*)::int from invitation where inviter_id = ${leaver}) as invitations
    `).toEqual([{ sessions: 0, accounts: 0, members: 0, invitations: 0 }]);
  });
});

describe("what goes with a workspace", () => {
  it("deleting a workspace deletes its memberships and invitations and forgets it as anyone's last workspace", async () => {
    const closing = "org_better_auth_schema_closing";
    const stayer = "better_auth_schema_stayer";
    await sql`insert into organizations (id, name, slug) values (${closing}, 'Closing', 'better-auth-schema-closing')`;
    await signedUpMember(stayer, closing);
    await sql`update profiles set last_workspace_id = ${closing} where id = ${stayer}`;
    await invite("better_auth_schema_invite_to_closing", closing, stayer);

    await sql`delete from organizations where id = ${closing}`;

    expect(await sql`
      select
        (select count(*)::int from member where organization_id = ${closing}) as members,
        (select count(*)::int from invitation where organization_id = ${closing}) as invitations,
        (select last_workspace_id from profiles where id = ${stayer}) as last_workspace_id,
        (select count(*)::int from session where user_id = ${stayer}) as sessions
    `).toEqual([{ members: 0, invitations: 0, last_workspace_id: null, sessions: 1 }]);
  });

  it("refuses a last workspace that doesn't exist", async () => {
    await expect(sql`update profiles set last_workspace_id = 'org_nowhere' where id = ${PERSON}`)
      .rejects.toMatchObject({ code: "23503" });
  });
});

describe("Better Auth's keys", () => {
  it("gives a person one membership per workspace", async () => {
    const joiner = "better_auth_schema_joiner";
    await signedUpMember(joiner, ORG);
    await expect(sql`
      insert into member (id, organization_id, user_id, role, created_at)
      values ('better_auth_schema_joiner_again', ${ORG}, ${joiner}, 'member', ${NOW})
    `).rejects.toMatchObject({ code: "23505" });
  });

  it("refuses a second session with the same token and a second counter with the same key", async () => {
    await expect(sql`
      insert into session (id, expires_at, token, updated_at, user_id)
      values ('better_auth_schema_joiner_session_2', ${LATER}, 'better_auth_schema_joiner_token', ${NOW}, 'better_auth_schema_joiner')
    `).rejects.toMatchObject({ code: "23505" });
    await sql`insert into rate_limit (id, key, count, last_request) values ('better_auth_schema_rl', 'better_auth_schema_key', 1, 1)`;
    await expect(sql`
      insert into rate_limit (id, key, count, last_request) values ('better_auth_schema_rl_2', 'better_auth_schema_key', 1, 1)
    `).rejects.toMatchObject({ code: "23505" });
    await sql`delete from rate_limit where id = 'better_auth_schema_rl'`;
  });

  it("looks verification codes up by identifier", async () => {
    expect(await sql`
      select indexdef from pg_indexes where schemaname = 'public' and tablename = 'verification' and indexdef like '%(identifier)'
    `).toHaveLength(1);
  });
});

describe("migration 0055", () => {
  const MIGRATION = "0055_better_auth.sql";
  // Comments describe the migration; only its statements must stay add-only.
  const statements = readFileSync(path.resolve(__dirname, "migrations", MIGRATION), "utf8")
    .replace(/--.*$/gm, "");

  it("runs straight after 0054 in the local reset", () => {
    const names = migrationPlan().map((file) => path.basename(file));
    expect(names.slice(names.indexOf(MIGRATION) - 1, names.indexOf(MIGRATION) + 1))
      .toEqual(["0054_custom_pass_fail.sql", MIGRATION]);
  });

  it("drops, renames and retypes nothing", () => {
    expect(statements).not.toMatch(/\bDROP\b/i);
    expect(statements).not.toMatch(/\bRENAME\b/i);
    expect(statements).not.toMatch(/\bALTER\s+(COLUMN\s+)?\S+\s+(SET\s+DATA\s+)?TYPE\b/i);
  });

  it("adds no column as NOT NULL without a default", () => {
    const added = [...statements.matchAll(/ADD\s+COLUMN\s+([^,;]+)/gi)].map(([, column]) => column.trim());
    expect(added).toHaveLength(5);
    for (const column of added) {
      if (/\bNOT\s+NULL\b/i.test(column)) expect(column, column).toMatch(/\bDEFAULT\b/i);
    }
  });
});

describe("Better Auth tables", () => {
  it.each(BETTER_AUTH_TABLES)("%s exists with row-level security on", async (table) => {
    expect(await sql`
      select relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relname = ${table} and relkind = 'r'
    `).toEqual([{ relrowsecurity: true }]);
  });

  it.each(BETTER_AUTH_TABLES)("%s grants nothing to anon, authenticated or PUBLIC", async (table) => {
    expect(await sql`
      select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = ${table} and grantee in ('PUBLIC', 'anon', 'authenticated')
    `).toEqual([]);
    for (const role of ["anon", "authenticated"]) {
      const [{ allowed }] = await sql`
        select has_table_privilege(${role}, ${`public.${table}`}, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as allowed
      `;
      expect(allowed, `${role} on ${table}`).toBe(false);
    }
  });
});
