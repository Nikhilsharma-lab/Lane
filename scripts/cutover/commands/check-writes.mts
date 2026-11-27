// `check-writes`, read-only (#410 runbook step 3, stories 30–31): just before the outage, the target must hold exactly
// what its latest export holds: each table's rows and newest created_at and updated_at, and the bucket's files. A
// table 0055 added counts only if it has rows. Any difference is a stop: a write after the export would be lost by
// the emptying, so Nikhil exports and rehearses again before going on.
import type { Command } from "../command.mts";
import { readOnly } from "../database.mts";
import { fileDifferences, latestExport, readTables, tableDifferences } from "../exports.mts";

export const checkWrites: Command = {
  name: "check-writes",
  usage: "check-writes <staging|production|rehearsal> [--folder <lane_rehearsal_… folder>]",
  environments: 1,
  bucket: true,
  async run({ targets: [target], environment, workingFolder, print, logStep }) {
    const found = latestExport(workingFolder, environment);
    if (!found) {
      print(`STOP: There is no export of ${environment} to check against. Run export ${environment} first.`);
      logStep({ step: "check-writes", result: "stop", detail: "no export" });
      return "stop";
    }
    const tables = await readOnly(target.database, readTables);
    const objects = await target.bucket!.list();
    const differences = [...tableDifferences(found.record.tables, tables), ...fileDifferences(found.record.files, objects, true)];

    print(`Compared ${target.label} with ${found.name}, taken ${found.record.takenAt}.`);
    for (const difference of differences) print(`STOP: ${difference}`);
    const result = differences.length ? "stop" : "ok";
    logStep({
      step: "check-writes",
      result,
      export: found.name,
      counts: { differences: differences.length },
      ...(differences.length ? { detail: "the target changed since the export" } : {}),
    });
    print(
      result === "ok"
        ? `Check writes: ok. Nothing was written since ${found.name}.`
        : `Check writes: stop. Something was written after the export. Export ${environment} again and rehearse it before going on. Nothing was changed.`,
    );
    return result;
  },
};
