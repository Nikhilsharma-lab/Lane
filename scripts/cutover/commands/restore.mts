// `restore`, the rollback (#410 "Rollback", stories 63–66): the environment's latest export put back. It opens the
// export (archive SHA256, decrypt, manifest inside == beside, dump SHA256) before touching anything, then empties
// every public table (Better Auth's included, so no password hash or session from after the cutover survives) and
// every object, restores the export's rows into the schema as it stands (0055 stays, #335 Q2), re-uploads every file
// under its path and content type, and checks every count and checksum against the manifest. Safe to rerun: each run
// starts by emptying.
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { Command } from "../command.mts";
import { latestExport, MANIFEST } from "../exports.mts";
import { openArchive, rollBack } from "../rollback.mts";

export const restore: Command = {
  name: "restore",
  usage: "restore <staging|production|rehearsal> [--folder <lane_rehearsal_… folder>]   (the rollback: empties it and restores its latest export)",
  environments: 1,
  bucket: true,
  async run({ targets: [target], environment, workingFolder, pgpassFile, privateFolder, atExit, print, logStep }) {
    const found = latestExport(workingFolder, environment);
    const stop = (problems: string[], detail: string, last: string) => {
      for (const problem of problems) print(`STOP: ${problem}`);
      logStep({ step: "restore", result: "stop", ...(found ? { export: found.name } : {}), detail });
      print(last);
      return "stop" as const;
    };
    if (!found) return stop([`There is no export of ${environment} to restore.`], "no export", "Restore: stop. Nothing was emptied or restored.");
    print(`Restoring ${found.name}, taken ${found.record.takenAt}, into ${target.label}. Everything ${target.label} holds now is emptied first.`);

    const workspace = path.join(privateFolder, "restore");
    const removeWorkspace = () => rmSync(workspace, { recursive: true, force: true });
    atExit(removeWorkspace);
    try {
      const opened = path.join(workspace, "archive");
      print("Decrypting. gpg asks for the export's passphrase.");
      const broken = await openArchive(found, opened);
      if (broken.length) return stop(broken, "the export isn't the one its manifest describes", "Restore: stop. Nothing was emptied or restored.");

      const manifest = JSON.parse(readFileSync(path.join(opened, MANIFEST), "utf8"));
      const problems = await rollBack({ target, manifest, opened, pgpassFile, print });
      if (problems.length) {
        return stop(problems, `${problems.length} difference(s) from the export after restoring`, `Restore: stop. ${target.label} doesn't match ${found.name} yet. Run restore ${environment} again.`);
      }
      const { record } = found;
      logStep({
        step: "restore",
        result: "ok",
        export: found.name,
        counts: { tables: Object.fromEntries(Object.entries(record.tables).map(([table, summary]) => [table, summary.rows])), files: record.files.length },
        sha256: { archive: record.archive.sha256, dump: record.dump.sha256 },
      });
      print(
        `Restore: ok. ${target.label} holds exactly what ${found.name} holds: every table's rows and newest timestamps, and every file's SHA256 and content type, matched the manifest. Tables the export doesn't have are empty.`,
      );
      return "ok";
    } finally {
      removeWorkspace();
    }
  },
};
