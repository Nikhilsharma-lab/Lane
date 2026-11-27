// `state`, read-only (#410): what an environment holds before it's exported and emptied. Stops the runbook on two
// profiles emails that differ only in case (0055's unique index, #369) and on any Stripe or Slack ID (#345 Q1).
import { readOnly, rowCounts, type Sql } from "../database.mts";
import type { Command } from "../command.mts";

// What each migration leaves behind, as the 0035–0053 release kit probed them. 0040 and 0044 change only rows.
const SIGNS: Readonly<Record<string, string>> = {
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

async function tableExists(sql: Sql, table: string): Promise<boolean> {
  const [row] = await sql`select to_regclass(${`public.${table}`}) is not null as present`;
  return row.present;
}

export const state: Command = {
  name: "state",
  usage: "state <staging|production|rehearsal> [--folder <lane_rehearsal_… folder>]",
  environments: 1,
  bucket: true,
  async run({ targets: [target], print, logStep }) {
    const read = await readOnly(target.database, async (sql) => {
      const present: string[] = [];
      for (const [migration, sign] of Object.entries(SIGNS)) {
        const [row] = await sql.unsafe(sign);
        if (Number(row.count) > 0) present.push(migration);
      }
      const tables = await rowCounts(sql);
      const duplicates = await sql<{ email: string; profiles: number }[]>`
        select lower(email) as email, count(*)::int as profiles from public.profiles
        where email is not null group by lower(email) having count(*) > 1 order by 1`;
      const stripe = (await tableExists(sql, "workspace_billing"))
        ? await sql<{ org_id: string }[]>`
            select org_id from public.workspace_billing
            where provider_customer_id is not null or provider_subscription_id is not null order by org_id`
        : [];
      const slack = (await tableExists(sql, "slack_connections"))
        ? await sql<{ org_id: string }[]>`select org_id from public.slack_connections order by org_id`
        : [];
      return { present, tables, duplicates, stripe, slack };
    });
    const files = (await target.bucket!.list()).length;

    const missing = Object.keys(SIGNS).filter((migration) => !read.present.includes(migration));
    print(`Latest migration: ${read.present.at(-1) ?? "none of 0034–0055"}`);
    print(`Missing: ${missing.length ? missing.join(", ") : "none"} (0040 and 0044 change only rows and aren't probed)`);
    print("Rows per public table:");
    const width = Math.max(...Object.keys(read.tables).map((name) => name.length));
    for (const [name, rows] of Object.entries(read.tables)) print(`  ${name.padEnd(width)}  ${rows}`);
    print(`Files in request-attachments: ${files} (${target.bucket!.description})`);

    const stops: string[] = [];
    if (read.duplicates.length) {
      stops.push(`profiles has ${read.duplicates.length} email(s) that differ only in case, so 0055's unique index would fail or split a person:`);
      for (const { email, profiles } of read.duplicates) stops.push(`  ${email} (${profiles} profiles)`);
    }
    if (read.stripe.length) stops.push(`workspace_billing holds a Stripe ID for workspace(s) ${read.stripe.map((row) => row.org_id).join(", ")}; emptying would strand it in Stripe.`);
    if (read.slack.length) stops.push(`slack_connections holds a Slack ID for workspace(s) ${read.slack.map((row) => row.org_id).join(", ")}; emptying would strand it in Slack.`);
    if (!read.duplicates.length) print("Emails that differ only in case: none");
    if (!read.stripe.length && !read.slack.length) print("Stripe or Slack IDs: none");
    for (const line of stops) print(`STOP: ${line}`);

    const result = stops.length ? "stop" : "ok";
    logStep({
      step: "state",
      result,
      counts: { latestMigration: read.present.at(-1) ?? null, missingMigrations: missing, tables: read.tables, files, caseDuplicateEmails: read.duplicates.length, stripeIds: read.stripe.length, slackIds: read.slack.length },
      ...(stops.length ? { detail: "state found a case-only duplicate email or a Stripe or Slack ID" } : {}),
    });
    print(result === "ok" ? "State: ok. Nothing was changed." : "State: stop. Fix what's listed before the export. Nothing was changed.");
    return result;
  },
};
