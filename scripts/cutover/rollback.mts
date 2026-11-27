// The rollback (#410 "restore", "Rollback"; stories 63–65), shared by `restore` and `rehearse`'s drill: open an
// export, empty the target (every public table, Better Auth's included, and every object), restore the export's data
// into the schema as it stands (0055 stays, #335 Q2), re-upload every file under its path and content type, and check
// every count and checksum against the manifest.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { extractTar } from "./archive.mts";
import type { Target } from "./command.mts";
import { connect, type Sql } from "./database.mts";
import { emptyBucket, emptyTables } from "./emptying.mts";
import { DUMP, fileDifferences, fileSha256, FILES, MANIFEST, readTables, tableDifferences, type FoundExport, type Manifest } from "./exports.mts";
import { decrypt } from "./gpg.mts";
import { pgConnection, runTool } from "./tools.mts";

/**
 * Decrypts the export into `opened` and checks it is the export the manifest beside it describes. Gives back what
 * is wrong with it; nothing is restored from an export that has anything wrong.
 */
export async function openArchive(found: FoundExport, opened: string): Promise<string[]> {
  const { record } = found;
  const archive = path.join(found.folder, record.archive.file);
  if ((await fileSha256(archive)) !== record.archive.sha256) {
    return [`The archive's SHA256 isn't the one exported (${record.archive.sha256}). Export again.`];
  }
  mkdirSync(opened, { recursive: true, mode: 0o700 });
  let names: string[] = [];
  await decrypt(archive, async (plain) => {
    names = await extractTar(plain, opened);
  });
  const problems: string[] = [];
  const beside: Record<string, unknown> = { ...record };
  delete beside.archive;
  const inside = JSON.parse(readFileSync(path.join(opened, MANIFEST), "utf8"));
  if (JSON.stringify(inside) !== JSON.stringify(beside)) problems.push("The manifest inside the archive isn't the one beside it. Export again.");
  const expected = [MANIFEST, DUMP, ...record.files.map((file) => `${FILES}/${file.path}`)].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) problems.push(`The archive holds ${names.length} entries; its manifest lists ${expected.length}. Export again.`);
  if ((await fileSha256(path.join(opened, DUMP))) !== record.dump.sha256) problems.push("The dump's SHA256 isn't the one in the manifest. Export again.");
  return problems;
}

/**
 * Every table's rows and newest timestamps, and every file's path, size, type and SHA256 (downloaded again), against
 * the manifest. A table the export doesn't have counts only if it holds rows.
 */
export async function checkAgainstManifest(target: Target, manifest: Manifest): Promise<string[]> {
  const sql = connect(target.database);
  let tables;
  try {
    tables = await sql.begin("read only", (transaction) => readTables(transaction as unknown as Sql));
  } finally {
    await sql.end();
  }
  const bucket = target.bucket!;
  const objects = [];
  for (const object of await bucket.list()) {
    const bytes = await bucket.read(object.path);
    objects.push({ ...object, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return [...tableDifferences(manifest.tables, tables), ...fileDifferences(manifest.files, objects)];
}

/**
 * The export's rows, restored into the schema as it stands, in one transaction: a failure leaves the tables as they
 * were (empty). Replication role "replica" holds back foreign-key checks and triggers, so the tables load in any
 * order and every row comes back exactly as dumped, timestamps included. The plain SQL sits in the run's owner-only
 * folder only while psql reads it.
 */
async function restoreRows(target: Target, opened: string, pgpassFile: string): Promise<void> {
  const pg = pgConnection(target.database, pgpassFile);
  const rows = path.join(path.dirname(opened), "rows.sql");
  try {
    await runTool("pg_restore", ["--data-only", "--no-owner", "--no-acl", "--file", rows, path.join(opened, DUMP)], { env: pg.env });
    await runTool(
      "psql",
      [
        ...pg.args, "--dbname", target.database.database, "-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction",
        "-c", "SET LOCAL lock_timeout = '10s'", "-c", "SET LOCAL session_replication_role = replica", "-f", rows,
      ],
      { env: pg.env },
    );
  } catch (error) {
    throw new Error(`The export's rows didn't restore and were rolled back: every table in public is empty. Run restore again once what psql said is fixed. ${(error as Error).message}`);
  } finally {
    rmSync(rows, { force: true });
  }
}

export type Rollback = Readonly<{
  target: Target;
  manifest: Manifest;
  /** The opened archive: manifest.json, public.dump and files/<object path>, in the run's owner-only folder. */
  opened: string;
  pgpassFile: string;
  print: (line: string) => void;
}>;

/** Empties the target, restores the export into it and checks it. Gives back what doesn't match; a throw is a failure. */
export async function rollBack({ target, manifest, opened, pgpassFile, print }: Rollback): Promise<string[]> {
  const before = await emptyTables(target.database);
  print(`Emptied ${Object.keys(before).length} tables in public (${Object.values(before).reduce((sum, rows) => sum + rows, 0)} rows) in one transaction.`);
  const bucket = target.bucket!;
  const emptied = await emptyBucket(bucket);
  if (emptied.left) return [...emptied.failures, `${emptied.left} files are still in ${bucket.description}. Run restore again.`];
  print(`Removed ${emptied.removed} files from ${bucket.description}.`);
  await restoreRows(target, opened, pgpassFile);
  print("Restored the export's rows into the schema as it stands.");
  for (const file of manifest.files) await bucket.write(file.path, readFileSync(path.join(opened, FILES, file.path)), file.contentType);
  print(`Uploaded ${manifest.files.length} files under their paths and content types.`);
  return checkAgainstManifest(target, manifest);
}
