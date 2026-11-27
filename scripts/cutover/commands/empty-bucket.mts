// `empty-bucket` (#410 runbook step 4, after empty; story 34): every object in request-attachments, at any depth,
// removed in batches. It reports what's left and is rerun until that's 0. It never deletes the bucket or changes
// its settings. Only inside the window, as empty (window.mts).
import { BUCKET } from "../bucket.mts";
import type { Command } from "../command.mts";
import { emptyBucket, REMOVE_BATCH } from "../emptying.mts";
import { emptyingWindow } from "../window.mts";

export const emptyBucketCommand: Command = {
  name: "empty-bucket",
  usage: "empty-bucket <staging|production|rehearsal> [--folder <lane_rehearsal_… folder>]   (after empty; rerun until it reports 0)",
  environments: 1,
  bucket: true,
  async run({ targets: [target], environment, workingFolder, print, logStep }) {
    const window = emptyingWindow(workingFolder, environment);
    if (!window.open) {
      print(`STOP: ${window.problem}`);
      logStep({ step: "empty-bucket", result: "stop", ...(window.found ? { export: window.found.name } : {}), detail: "outside the window" });
      print("Empty bucket: stop. Nothing was removed.");
      return "stop";
    }
    print(`Removing every file in ${target.bucket!.description}, ${REMOVE_BATCH} at a time.`);
    const { found, removed, left, failures } = await emptyBucket(target.bucket!);
    for (const failure of failures) print(`STOP: ${failure}`);
    print(`Files left in ${BUCKET}: ${left}`);
    const result = left === 0 ? "ok" : "stop";
    logStep({ step: "empty-bucket", result, export: window.found.name, counts: { found, removed, left }, ...(left ? { detail: `${left} files left` } : {}) });
    print(
      result === "ok"
        ? `Empty bucket: ok. ${BUCKET} holds 0 files; the bucket and its settings are as they were. Next: promote the Better Auth build, then check-zero ${environment}.`
        : `Empty bucket: stop. ${left} files are left. Run empty-bucket ${environment} again until it reports 0.`,
    );
    return result;
  },
};
