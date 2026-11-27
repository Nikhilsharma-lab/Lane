// `check-zero`, read-only (#410 runbook step 5, the outage's last step; stories 36–37): every table in `public`
// and request-attachments at 0 before anyone signs up. Anything there is a stop that says to roll back and repeat,
// never to delete it by hand.
import { BUCKET } from "../bucket.mts";
import type { Command } from "../command.mts";
import { readOnly, rowCounts } from "../database.mts";

export const checkZero: Command = {
  name: "check-zero",
  usage: "check-zero <staging|production|rehearsal> [--folder <lane_rehearsal_… folder>]",
  environments: 1,
  bucket: true,
  async run({ targets: [target], environment, print, logStep }) {
    const tables = await readOnly(target.database, rowCounts);
    const files = (await target.bucket!.list()).length;
    const notEmpty = Object.fromEntries(Object.entries(tables).filter(([, rows]) => rows > 0));
    const rows = Object.values(notEmpty).reduce((sum, count) => sum + count, 0);

    for (const [table, count] of Object.entries(notEmpty)) print(`STOP: ${table} holds ${count} row(s).`);
    if (files) print(`STOP: ${BUCKET} holds ${files} file(s).`);
    const result = rows === 0 && files === 0 ? "ok" : "stop";
    logStep({
      step: "check-zero",
      result,
      counts: { tables: Object.keys(tables).length, rows, files, notEmpty },
      ...(result === "stop" ? { detail: "not empty after the emptying" } : {}),
    });
    print(
      result === "ok"
        ? `Check zero: ok. Every table in public is at 0 rows and ${BUCKET} holds 0 files. Nothing was changed.`
        : `Check zero: stop. Something is in ${environment} after the emptying. Roll back with restore ${environment}, then repeat the cutover. Never delete rows or files by hand.`,
    );
    return result;
  },
};
