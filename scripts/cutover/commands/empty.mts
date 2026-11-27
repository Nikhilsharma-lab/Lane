// `empty` (#410 runbook step 4, the outage's first step; stories 32, 33, 35): every table in `public`, read from the
// catalog at that moment, truncated in one statement in one transaction, sequences restarted. No other schema is
// touched. A failure rolls back and empties nothing. Only inside the window (window.mts): after the latest export
// has passed a rehearsal and check-writes, and for a rerun after empty has passed against that export.
import type { Command } from "../command.mts";
import { emptyTables } from "../emptying.mts";
import { emptyingWindow } from "../window.mts";

export const empty: Command = {
  name: "empty",
  usage: "empty <staging|production|rehearsal>   (inside the outage, after check-writes passes)",
  environments: 1,
  bucket: false,
  async run({ targets: [target], environment, workingFolder, print, logStep }) {
    const window = emptyingWindow(workingFolder, environment);
    if (!window.open) {
      print(`STOP: ${window.problem}`);
      logStep({ step: "empty", result: "stop", ...(window.found ? { export: window.found.name } : {}), detail: "outside the window" });
      print("Empty: stop. Nothing was emptied.");
      return "stop";
    }
    const before = await emptyTables(target.database);
    const rows = Object.values(before).reduce((sum, count) => sum + count, 0);
    logStep({ step: "empty", result: "ok", export: window.found.name, counts: { tables: before } });
    print(`Emptied ${Object.keys(before).length} tables in public (${rows} rows) in one transaction.`);
    print(`Empty: ok. Every table in public is at 0 rows. No other schema was touched. Next: empty-bucket ${environment}.`);
    return "ok";
  },
};
