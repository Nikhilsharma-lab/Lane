// An export and its manifest (#410 "export"): where exports live, what the manifest holds, and how a database and a
// bucket are compared with it (rehearse and check-writes now; restore and its drill in #413).
//
// <working folder>/<environment>/lane-<environment>-<UTC time>/
//   lane-<environment>-<UTC time>.tar.gpg   the encrypted archive: manifest.json, public.dump, files/<object path>
//   manifest.json                           the same manifest, plus the archive's own SHA256 (written last)
// The manifest holds counts, timestamps, object paths (IDs, never file names, in Lane) and checksums: no row data.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StoredObject } from "./bucket.mts";
import type { Sql } from "./database.mts";
import type { Environment } from "./environments.mts";

export const MANIFEST = "manifest.json";
export const DUMP = "public.dump";
export const FILES = "files";
export const KEEP_DAYS = 28;

export type TableSummary = Readonly<{
  rows: number;
  /** Newest created_at, as Postgres prints it in UTC; null when the table is empty. Absent without the column. */
  newestCreatedAt?: string | null;
  newestUpdatedAt?: string | null;
}>;

export type ExportedFile = Readonly<StoredObject & { sha256: string }>;

export type Manifest = Readonly<{
  format: "lane-cutover-export/1";
  environment: Environment;
  takenAt: string;
  /** The day the export must be deleted (#345 Q3, #333 Q9): 28 days after it was taken. */
  deleteBy: string;
  latestMigration: string | null;
  tables: Readonly<Record<string, TableSummary>>;
  files: readonly ExportedFile[];
  dump: Readonly<{ file: typeof DUMP; sha256: string; bytes: number }>;
}>;

/** The manifest beside the archive: the one inside it, plus the archive's own checksum. */
export type ExportRecord = Manifest & Readonly<{ archive: Readonly<{ file: string; sha256: string; bytes: number }> }>;

export type FoundExport = Readonly<{ name: string; folder: string; record: ExportRecord }>;

export function exportName(environment: Environment, takenAt: Date): string {
  return `lane-${environment}-${takenAt.toISOString().replace(/[:.]/g, "-")}`;
}

export function deleteBy(takenAt: Date): string {
  return new Date(takenAt.getTime() + KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/** The newest complete export of an environment: one whose manifest beside the archive was written. */
export function latestExport(workingFolder: string, environment: Environment): FoundExport | undefined {
  const parent = path.join(workingFolder, environment);
  if (!existsSync(parent)) return undefined;
  const pattern = new RegExp(`^lane-${environment}-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d-\\d\\d-\\d{3}Z$`);
  for (const name of readdirSync(parent).filter((entry) => pattern.test(entry)).sort().reverse()) {
    const folder = path.join(parent, name);
    try {
      const record = JSON.parse(readFileSync(path.join(folder, MANIFEST), "utf8")) as ExportRecord;
      if (record.archive?.sha256) return { name, folder, record };
    } catch {}
  }
  return undefined;
}

/** Writes JSON so that a reader sees the whole file or none of it. */
export function writeJsonOnce(file: string, value: unknown): void {
  writeFileSync(`${file}.partial`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${file}.partial`, file);
}

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * Every base table in `public`, read from the catalog now: its rows and newest created_at and updated_at where it
 * has them. Run inside a transaction: it sets the time zone and date style for that transaction only.
 */
export async function readTables(sql: Sql): Promise<Record<string, TableSummary>> {
  await sql`set local timezone to 'UTC'`;
  await sql`set local datestyle to 'ISO'`;
  const tables = await sql<{ name: string; created: boolean; updated: boolean }[]>`
    select t.table_name as name,
      coalesce(bool_or(c.column_name = 'created_at'), false) as created,
      coalesce(bool_or(c.column_name = 'updated_at'), false) as updated
    from information_schema.tables t
    left join information_schema.columns c on c.table_schema = t.table_schema and c.table_name = t.table_name
      and c.column_name in ('created_at', 'updated_at')
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    group by t.table_name order by t.table_name`;
  const summaries: Record<string, TableSummary> = {};
  for (const { name, created, updated } of tables) {
    const columns = ["count(*)::bigint as rows", created && "max(created_at)::text as created", updated && "max(updated_at)::text as updated"].filter(Boolean);
    const [row] = await sql.unsafe(`select ${columns.join(", ")} from public.${quoted(name)}`);
    summaries[name] = {
      rows: Number(row.rows),
      ...(created ? { newestCreatedAt: row.created } : {}),
      ...(updated ? { newestUpdatedAt: row.updated } : {}),
    };
  }
  return summaries;
}

const LISTED = 10;

/**
 * How `now` differs from the export's tables, one line per difference. A table the export doesn't have is a
 * difference only if it holds rows: 0055 adds empty tables between the export and the writes check.
 */
export function tableDifferences(exported: Manifest["tables"], now: Readonly<Record<string, TableSummary>>): string[] {
  const differences: string[] = [];
  for (const [table, then] of Object.entries(exported)) {
    const current = now[table];
    if (!current) {
      differences.push(`${table}: in the export, missing now`);
      continue;
    }
    if (current.rows !== then.rows) differences.push(`${table}: ${then.rows} rows in the export, ${current.rows} now`);
    for (const [key, column] of [["newestCreatedAt", "created_at"], ["newestUpdatedAt", "updated_at"]] as const) {
      if (key in then && then[key] !== current[key]) differences.push(`${table}: newest ${column} ${then[key] ?? "none"} in the export, ${current[key] ?? "none"} now`);
    }
  }
  for (const [table, current] of Object.entries(now)) {
    if (!(table in exported) && current.rows > 0) differences.push(`${table}: not in the export, ${current.rows} rows now`);
  }
  return differences;
}

/** How a bucket's objects differ from the export's files. Checksums are compared when `now` carries them. */
export function fileDifferences(exported: readonly ExportedFile[], now: ReadonlyArray<StoredObject & { sha256?: string }>): string[] {
  const differences: string[] = [];
  const current = new Map(now.map((object) => [object.path, object]));
  const then = new Map(exported.map((file) => [file.path, file]));
  if (now.length !== exported.length) differences.push(`${exported.length} files in the export, ${now.length} now`);
  const missing = exported.filter((file) => !current.has(file.path)).map((file) => file.path);
  const extra = now.filter((object) => !then.has(object.path)).map((object) => object.path);
  const changed = exported.flatMap((file) => {
    const object = current.get(file.path);
    if (!object) return [];
    const what = [
      object.size !== file.size && `size ${file.size} in the export, ${object.size} now`,
      object.sha256 !== undefined && object.sha256 !== file.sha256 && "a different SHA256",
      object.contentType !== file.contentType && `type ${file.contentType} in the export, ${object.contentType} now`,
    ].filter(Boolean);
    return what.length ? [`${file.path}: ${what.join(", ")}`] : [];
  });
  const list = (label: string, paths: string[]) =>
    paths.length ? [`${label}: ${paths.slice(0, LISTED).join(", ")}${paths.length > LISTED ? ` and ${paths.length - LISTED} more` : ""}`] : [];
  return [...differences, ...list("missing now", missing), ...list("not in the export", extra), ...changed.slice(0, LISTED)];
}
