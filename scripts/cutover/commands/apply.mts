// `apply` (#410 runbook step 2, story 29): 0055 on the real database, with Clerk still live (it ignores 0055). Only
// after the environment's latest export has passed a rehearsal with this same 0055 (AGENTS.md: a verified export
// before every migration). Then the duplicate-email check (#369), then the file through psql -v ON_ERROR_STOP=1 in
// its own transaction with a lock timeout. A failure leaves the database as it was; 0055 may stay if a later step
// stops (#410 story 40). On a database already at 0055 it changes nothing.
import type { Command } from "../command.mts";
import { connect, type Sql } from "../database.mts";
import { latestExport } from "../exports.mts";
import { applyBetterAuth, betterAuthMigrationSha256, hasBetterAuth, presentMigrations } from "../migrations.mts";
import { readSteps } from "../step-log.mts";

export const apply: Command = {
  name: "apply",
  usage: "apply <staging|production|rehearsal>",
  environments: 1,
  bucket: false,
  async run({ targets: [target], environment, workingFolder, pgpassFile, print, logStep }) {
    const migration = betterAuthMigrationSha256();
    const stop = (lines: string[], detail: string, counts?: Record<string, unknown>) => {
      for (const line of lines) print(`STOP: ${line}`);
      logStep({ step: "apply", result: "stop", detail, sha256: { migration }, ...(counts ? { counts } : {}) });
      print("Apply: stop. 0055 didn't run. Nothing was changed.");
      return "stop" as const;
    };

    const sql = connect(target.database);
    let there: boolean, present: string[];
    try {
      [there, present] = await sql.begin("read only", async (transaction) => {
        const read = transaction as unknown as Sql;
        return [await hasBetterAuth(read), await presentMigrations(read)] as const;
      });
    } finally {
      await sql.end();
    }
    if (there) {
      logStep({ step: "apply", result: "ok", counts: { alreadyAt0055: true }, sha256: { migration } });
      print(`${target.label} is already at 0055. Nothing was changed.`);
      return "ok";
    }
    if (!present.includes("0054")) return stop([`${target.label} isn't at 0054 (latest: ${present.at(-1) ?? "none"}). 0055 comes after 0054 only.`], "not at 0054");

    const found = latestExport(workingFolder, environment);
    const rehearsed = found && readSteps(workingFolder, environment).some((line) =>
      line.step === "rehearse" && line.result === "ok" && line.export === found.name && line.sha256?.migration === migration);
    if (!found) return stop([`There is no export of ${environment}. Run export ${environment}, then rehearse ${environment}, first.`], "no export");
    if (!rehearsed) {
      return stop([`The latest export of ${environment} (${found.name}) hasn't passed a rehearsal with this 0055. Run rehearse ${environment} first.`], "export not rehearsed");
    }

    print(`Applying 0055 to ${target.label} (rehearsed on ${found.name}).`);
    const outcome = await applyBetterAuth(target.database, pgpassFile);
    if (outcome.outcome === "duplicates") {
      return stop(
        [
          `profiles has ${outcome.duplicates.length} email(s) that differ only in case, so 0055's unique index would fail or split a person:`,
          ...outcome.duplicates.map(({ email, profiles }) => `  ${email} (${profiles} profiles)`),
        ],
        "case-only duplicate emails",
        { caseDuplicateEmails: outcome.duplicates.length },
      );
    }
    const check = connect(target.database);
    try {
      if (!(await hasBetterAuth(check))) throw new Error("psql finished, but the database doesn't have everything 0055 creates.");
    } finally {
      await check.end();
    }
    logStep({ step: "apply", result: "ok", export: found.name, counts: { alreadyAt0055: false, caseDuplicateEmails: 0 }, sha256: { migration } });
    print(`Apply: ok. ${target.label} is at 0055. Next: check-writes ${environment}.`);
    return "ok";
  },
};
