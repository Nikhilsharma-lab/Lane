// `rehearse` (#410 runbook step 1, stories 25–28): proves an environment's latest export restores, before anything
// relies on it. It never reaches the environment: it decrypts the export into this run's owner-only folder, restores
// it into a throwaway lane_rehearsal_kit_… database on the local server (anon and authenticated created first, as the
// 2026-10-10 runbook did) and a throwaway folder, checks every count and checksum against the manifest, and applies
// 0055 to the copy. Then it drills the rollback on the copy (#413, story 27): empty it, then restore the export into
// it as `restore` does, and check it again. The copy and the folder are dropped afterwards, after a pass, a stop, a
// failure or a signal.
//
// The work is a list of stages (REHEARSAL_STAGES), run in order.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { folderBucket } from "../bucket.mts";
import type { Command, Target } from "../command.mts";
import { connect, rowCounts } from "../database.mts";
import { emptyBucket, emptyTables } from "../emptying.mts";
import type { DatabaseTarget, Environment } from "../environments.mts";
import { DUMP, FILES, latestExport, MANIFEST, type FoundExport, type Manifest } from "../exports.mts";
import { applyBetterAuth, betterAuthMigrationSha256, hasBetterAuth, presentMigrations } from "../migrations.mts";
import { checkAgainstManifest, openArchive, rollBack } from "../rollback.mts";
import { alive } from "../secrets.mts";
import { pgConnection, runTool } from "../tools.mts";

/** A rehearsal's throwaway copy, and what it was made from. */
export type RehearsalCopy = Readonly<{
  environment: Environment;
  /** The copy as a kit target: a lane_rehearsal_kit_… database on the local server, and a folder for the bucket. */
  target: Target;
  found: FoundExport;
  manifest: Manifest;
  /** The decrypted archive: manifest.json, public.dump and files/<object path>, in the run's owner-only folder. */
  opened: string;
  pgpassFile: string;
  print: (line: string) => void;
}>;

/** One stage of a rehearsal. It gives back what it found wrong: nothing is a pass. A throw is a failure. */
export type RehearsalStage = Readonly<{ name: string; run: (copy: RehearsalCopy) => Promise<string[]> }>;

const COPY_PREFIX = "lane_rehearsal_kit_";

/** Restores the export into the empty copy: the dump (without its own "SCHEMA public"), then every file. */
export async function restoreIntoCopy(copy: RehearsalCopy): Promise<string[]> {
  const pg = pgConnection(copy.target.database, copy.pgpassFile);
  const dump = path.join(copy.opened, DUMP);
  // The new database has its own public schema; the dump's would clash with it (2026-10-10 runbook, 3.2).
  const list = (await runTool("pg_restore", ["--list", dump], { env: pg.env })).split("\n").filter((line) => !/ SCHEMA - public /.test(line));
  const listFile = path.join(path.dirname(copy.opened), "restore.list");
  writeFileSync(listFile, list.join("\n"), { mode: 0o600 });
  await runTool("pg_restore", [...pg.args, "--dbname", copy.target.database.database, "--no-owner", "--no-acl", "--exit-on-error", "--use-list", listFile, dump], { env: pg.env });
  for (const file of copy.manifest.files) {
    await copy.target.bucket!.write(file.path, readFileSync(path.join(copy.opened, FILES, file.path)), file.contentType);
  }
  return [];
}

/** Every table's rows and newest timestamps, and every file's path, size, type and SHA256, against the manifest. */
export async function checkCopy(copy: RehearsalCopy): Promise<string[]> {
  return checkAgainstManifest(copy.target, copy.manifest);
}

/** The drill's first half, as `empty` and `empty-bucket` do it: every table in the copy and every file at 0. */
async function emptyCopy(copy: RehearsalCopy): Promise<string[]> {
  await emptyTables(copy.target.database);
  const { failures } = await emptyBucket(copy.target.bucket!);
  const sql = connect(copy.target.database);
  let tables: Record<string, number>;
  try {
    tables = await rowCounts(sql);
  } finally {
    await sql.end();
  }
  const files = (await copy.target.bucket!.list()).length;
  return [
    ...failures,
    ...Object.entries(tables).filter(([, rows]) => rows > 0).map(([table, rows]) => `${table} still holds ${rows} rows after emptying.`),
    ...(files ? [`${files} files are still in the copy's folder after emptying.`] : []),
  ];
}

/** The drill's second half: the rollback `restore` runs, on the copy at 0055, then the same check against the manifest. */
async function restoreCopy(copy: RehearsalCopy): Promise<string[]> {
  return rollBack({ target: copy.target, manifest: copy.manifest, opened: copy.opened, pgpassFile: copy.pgpassFile, print: copy.print });
}

async function applyToCopy(copy: RehearsalCopy): Promise<string[]> {
  const outcome = await applyBetterAuth(copy.target.database, copy.pgpassFile);
  if (outcome.outcome === "duplicates") {
    return [`profiles has ${outcome.duplicates.length} email(s) that differ only in case, so 0055 fails on this data. Run state ${copy.environment} and settle them first.`];
  }
  if (outcome.outcome === "already there") copy.print("The export already has 0055.");
  const sql = connect(copy.target.database);
  try {
    return (await hasBetterAuth(sql)) ? [] : ["0055 ran, but the copy doesn't have everything 0055 creates."];
  } finally {
    await sql.end();
  }
}

export const REHEARSAL_STAGES: readonly RehearsalStage[] = [
  { name: "Restore the export into the copy", run: restoreIntoCopy },
  { name: "Check the copy against the manifest", run: checkCopy },
  { name: "Apply 0055 to the copy", run: applyToCopy },
  { name: "Rollback drill: empty the copy", run: emptyCopy },
  { name: "Rollback drill: restore the export into the copy and check it again", run: restoreCopy },
];

/** Drops throwaway copies a killed rehearsal left behind (named for a process that no longer runs). */
async function sweepCopies(server: DatabaseTarget, print: (line: string) => void): Promise<void> {
  const sql = connect(server);
  try {
    const rows = await sql<{ datname: string }[]>`select datname from pg_database where datname like ${`${COPY_PREFIX}%`}`;
    for (const { datname } of rows) {
      const pid = Number(/^lane_rehearsal_kit_(\d+)_[0-9a-f]+$/.exec(datname)?.[1]);
      if (!pid || alive(pid)) continue;
      await sql.unsafe(`drop database if exists "${datname}" with (force)`);
      print(`Dropped ${datname}, a throwaway copy an earlier, stopped rehearsal left.`);
    }
  } finally {
    await sql.end();
  }
}

async function createCopy(server: DatabaseTarget, name: string): Promise<void> {
  const sql = connect(server);
  try {
    // Supabase has these roles and the dump's policies name them; a plain local server may not. Never with a login.
    await sql.unsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await sql.unsafe(`create database "${name}" template template0`);
  } finally {
    await sql.end();
  }
}

export const rehearse: Command = {
  name: "rehearse",
  usage: "rehearse <staging|production|rehearsal>   (restores that environment's latest export locally; asks for your local Postgres server)",
  environments: 1,
  bucket: false,
  connects: "local server",
  async run({ environment, localServer, workingFolder, pgpassFile, privateFolder, atExit, print, logStep }) {
    const server = localServer!;
    const stop = (problems: string[], detail: string, found?: FoundExport) => {
      for (const problem of problems) print(`STOP: ${problem}`);
      logStep({ step: "rehearse", result: "stop", ...(found ? { export: found.name } : {}), detail });
      print("Rehearse: stop. Nothing outside the throwaway copy was touched. Don't apply 0055 until a rehearsal passes.");
      return "stop" as const;
    };
    const found = latestExport(workingFolder, environment);
    if (!found) return stop([`There is no export of ${environment} to rehearse. Run export ${environment} first.`], "no export");
    print(`Rehearsing ${found.name}.`);
    await sweepCopies(server, print);

    const workspace = path.join(privateFolder, "rehearsal");
    const removeWorkspace = () => rmSync(workspace, { recursive: true, force: true });
    atExit(removeWorkspace);
    try {
      const opened = path.join(workspace, "archive");
      print("Decrypting. gpg asks for the export's passphrase.");
      const broken = await openArchive(found, opened);
      if (broken.length) return stop(broken, "the export isn't the one its manifest describes", found);

      const name = `${COPY_PREFIX}${process.pid}_${randomBytes(4).toString("hex")}`;
      const pg = pgConnection(server, pgpassFile);
      let dropped = false;
      const dropCopy = () => {
        if (dropped) return;
        execFileSync("dropdb", [...pg.args, "--maintenance-db", server.database, "--if-exists", "--force", name], { env: pg.env, stdio: "ignore" });
        dropped = true;
      };
      atExit(dropCopy);
      const bucketFolder = path.join(workspace, "lane_rehearsal_bucket");
      mkdirSync(bucketFolder, { mode: 0o700 });
      const copy: RehearsalCopy = {
        environment,
        target: { environment: "rehearsal", label: "the throwaway copy", database: { ...server, database: name }, bucket: folderBucket(bucketFolder) },
        found,
        manifest: JSON.parse(readFileSync(path.join(opened, MANIFEST), "utf8")),
        opened,
        pgpassFile,
        print,
      };
      await createCopy(server, name);
      print(`Throwaway copy: ${name} and ${bucketFolder}`);
      let copyMigration: string | null = null;
      try {
        for (const stage of REHEARSAL_STAGES) {
          const problems = await stage.run(copy);
          if (problems.length) return stop(problems, `${stage.name}: ${problems.length} problem(s)`, found);
          print(`${stage.name}: ok`);
        }
        const sql = connect(copy.target.database);
        try {
          copyMigration = (await presentMigrations(sql)).at(-1) ?? null;
        } finally {
          await sql.end();
        }
      } finally {
        dropCopy();
      }

      const { record } = found;
      logStep({
        step: "rehearse",
        result: "ok",
        export: found.name,
        counts: { tables: Object.fromEntries(Object.entries(record.tables).map(([table, summary]) => [table, summary.rows])), files: record.files.length, copyMigration },
        sha256: { archive: record.archive.sha256, dump: record.dump.sha256, migration: betterAuthMigrationSha256() },
      });
      print(
        `Rehearse: ok. Every count and checksum matched ${found.name}, the copy reached ${copyMigration}, and the rollback drill emptied it and restored it to match again. The copy and its folder are dropped.`,
      );
      return "ok";
    } finally {
      removeWorkspace();
    }
  },
};
