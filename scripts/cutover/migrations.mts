// Which migrations a database has, and 0055, the one migration the cutover applies (#410 "apply"): Better Auth's
// tables and columns, after the duplicate-email check (#369), through psql in the file's own transaction, which
// stops at its first error and has a lock timeout. A failure leaves the database as it was.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { connect, type Sql } from "./database.mts";
import type { DatabaseTarget } from "./environments.mts";
import { pgConnection, runTool } from "./tools.mts";

// What each migration leaves behind, as the 0035–0053 release kit probed them. 0040 and 0044 change only rows.
export const SIGNS: Readonly<Record<string, string>> = {
  "0034": "select count(*) from information_schema.columns where table_schema='public' and table_name='requests' and column_name='done_at'",
  "0035": "select count(*) from information_schema.tables where table_schema='public' and table_name='request_expected_impact_revisions'",
  "0036": "select count(*) from information_schema.columns where table_schema='public' and table_name='requests' and column_name='no_measurable_impact_reason'",
  "0037": "select count(*) from information_schema.tables where table_schema='public' and table_name='metric_definitions'",
  "0038": "select count(*) from information_schema.tables where table_schema='public' and table_name='metric_definition_aliases'",
  "0039": "select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='prediction_definition_ids'",
  "0041": "select count(*) from information_schema.tables where table_schema='public' and table_name='delivery_log'",
  "0042": "select count(*) from information_schema.tables where table_schema='public' and table_name='slack_connections'",
  "0043": "select count(*) from information_schema.tables where table_schema='public' and table_name='quarter_notes'",
  "0045": "select count(*) from information_schema.columns where table_schema='public' and table_name='requests' and column_name='guest_submission'",
  "0046": "select count(*) from information_schema.tables where table_schema='public' and table_name='workspace_billing'",
  "0047": "select count(*) from information_schema.columns where table_schema='public' and table_name='workspace_billing' and column_name='billing_period'",
  "0048": "select count(*) from information_schema.columns where table_schema='public' and table_name='workspace_billing' and column_name='billed_seats'",
  "0049": "select count(*) from information_schema.columns where table_schema='public' and table_name='workspace_billing' and column_name='plan_ends_at'",
  "0050": "select count(*) from information_schema.tables where table_schema='public' and table_name='first_run_progress'",
  "0051": "select count(*) from information_schema.tables where table_schema='public' and table_name='same_problem_members'",
  "0052": "select count(*) from information_schema.tables where table_schema='public' and table_name='saved_views'",
  "0053": "select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='valid_corrected_value'",
  // 0054 adds the custom pass/fail check to the v5 validator.
  "0054": "select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='request_measurement_valid_v5' and p.prosrc like '%''recovery'',''custom''%'",
  "0055": "select count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='email_verified'",
};

/** The migrations whose signs are present, in order. */
export async function presentMigrations(sql: Sql): Promise<string[]> {
  const present: string[] = [];
  for (const [migration, sign] of Object.entries(SIGNS)) {
    const [row] = await sql.unsafe(sign);
    if (Number(row.count) > 0) present.push(migration);
  }
  return present;
}

export const BETTER_AUTH_MIGRATION = path.resolve(import.meta.dirname, "../../src/db/migrations/0055_better_auth.sql");

/** The SHA256 of the 0055 file in this checkout, logged wherever it runs so the rehearsed file is the applied one. */
export function betterAuthMigrationSha256(): string {
  return createHash("sha256").update(readFileSync(BETTER_AUTH_MIGRATION)).digest("hex");
}

/** Whether everything 0055 creates is there. */
export async function hasBetterAuth(sql: Sql): Promise<boolean> {
  const [row] = await sql<{ tables: number; columns: number; unique_email: boolean }[]>`
    select
      (select count(*)::int from information_schema.tables where table_schema = 'public'
        and table_name in ('session', 'account', 'verification', 'member', 'invitation', 'rate_limit')) as tables,
      (select count(*)::int from information_schema.columns where table_schema = 'public'
        and ((table_name = 'profiles' and column_name in ('email_verified', 'image', 'last_workspace_id'))
          or (table_name = 'organizations' and column_name in ('logo', 'metadata')))) as columns,
      to_regclass('public.profiles_email_unique') is not null as unique_email`;
  return row.tables === 6 && row.columns === 5 && row.unique_email;
}

/** Emails held by more than one profile once case is ignored: 0055's unique index would fail or split a person. */
export async function caseDuplicateEmails(sql: Sql): Promise<{ email: string; profiles: number }[]> {
  return sql<{ email: string; profiles: number }[]>`
    select lower(email) as email, count(*)::int as profiles from public.profiles
    where email is not null group by lower(email) having count(*) > 1 order by 1`;
}

export type BetterAuthOutcome =
  | Readonly<{ outcome: "already there" }>
  | Readonly<{ outcome: "applied" }>
  | Readonly<{ outcome: "duplicates"; duplicates: { email: string; profiles: number }[] }>;

/**
 * Brings `target` to 0055: nothing if it's already there; a stop, before 0055 runs, on a case-only duplicate email;
 * otherwise the file through psql -v ON_ERROR_STOP=1. Throws if psql fails, which rolls the whole file back.
 */
export async function applyBetterAuth(target: DatabaseTarget, pgpassFile: string): Promise<BetterAuthOutcome> {
  const sql = connect(target);
  try {
    const check = await sql.begin("read only", async (transaction) => {
      const read = transaction as unknown as Sql;
      return { there: await hasBetterAuth(read), duplicates: await caseDuplicateEmails(read) };
    });
    if (check.there) return { outcome: "already there" };
    if (check.duplicates.length) return { outcome: "duplicates", duplicates: check.duplicates };
  } finally {
    await sql.end();
  }
  const text = readFileSync(BETTER_AUTH_MIGRATION, "utf8");
  // The file's own BEGIN … COMMIT is what makes a failure leave nothing behind; refuse a file that lost it.
  if (!/^BEGIN;$/m.test(text) || !/^SET LOCAL lock_timeout = /m.test(text) || !/^COMMIT;\s*$/m.test(text)) {
    throw new Error("0055 no longer runs in one transaction with a lock timeout (BEGIN; SET LOCAL lock_timeout …; COMMIT;). Nothing was applied.");
  }
  const pg = pgConnection(target, pgpassFile);
  try {
    await runTool("psql", [...pg.args, "--dbname", target.database, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", BETTER_AUTH_MIGRATION], { env: pg.env });
  } catch (error) {
    throw new Error(`0055 stopped at its first error and was rolled back, so the database is as it was. ${(error as Error).message}`);
  }
  return { outcome: "applied" };
}
