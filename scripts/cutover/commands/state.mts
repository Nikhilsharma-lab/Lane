// `state`, read-only (#410): what an environment holds before it's exported and emptied. Stops the runbook on two
// profiles emails that differ only in case (0055's unique index, #369) and on any Stripe or Slack ID (#345 Q1).
import type { Command } from "../command.mts";
import { readOnly, rowCounts, type Sql } from "../database.mts";
import { caseDuplicateEmails, presentMigrations, SIGNS } from "../migrations.mts";

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
      const present = await presentMigrations(sql);
      const tables = await rowCounts(sql);
      const duplicates = await caseDuplicateEmails(sql);
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
