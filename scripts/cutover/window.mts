// When the kit may empty an environment (#410 runbook order: state → export → rehearse → apply → check-writes →
// outage → empty → empty-bucket). Emptying can't be undone except from the export, so `empty` and `empty-bucket`
// read the step log first. The window is open for the latest export once that export has passed a rehearsal (with
// its rollback drill) and the last check-writes logged passed against it. Once `empty` has passed against it, the
// window stays open for it, so a session that broke mid-outage can rerun empty and empty-bucket.
import type { Environment } from "./environments.mts";
import { latestExport, type FoundExport } from "./exports.mts";
import { readSteps } from "./step-log.mts";

export type Window = Readonly<{ open: true; found: FoundExport }> | Readonly<{ open: false; problem: string; found?: FoundExport }>;

export function emptyingWindow(workingFolder: string, environment: Environment): Window {
  const found = latestExport(workingFolder, environment);
  if (!found) {
    return { open: false, problem: `There is no export of ${environment}. The runbook empties only after export, rehearse, apply and check-writes ${environment} pass.` };
  }
  const steps = readSteps(workingFolder, environment);
  const passed = (step: string) => steps.some((line) => line.step === step && line.result === "ok" && line.export === found.name);
  if (!passed("rehearse")) {
    return { open: false, found, problem: `The latest export of ${environment} (${found.name}) hasn't passed a rehearsal. Run rehearse ${environment}, apply ${environment} and check-writes ${environment} first.` };
  }
  if (passed("empty")) return { open: true, found };
  const lastCheck = steps.filter((line) => line.step === "check-writes").at(-1);
  if (lastCheck?.result !== "ok" || lastCheck.export !== found.name) {
    return {
      open: false,
      found,
      problem: `The last check-writes ${environment} didn't pass against the latest export (${found.name}). Run check-writes ${environment}; if it stops, export and rehearse again.`,
    };
  }
  return { open: true, found };
}
