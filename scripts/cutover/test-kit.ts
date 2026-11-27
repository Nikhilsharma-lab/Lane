// The cutover kit's test setup (#411): a scratch database copied from this checkout's lane_test database, a scratch
// folder standing in for the bucket, a working folder for the step log, and a way to run the kit as the runbook
// does, with a stand-in clipboard. Every scratch thing is dropped afterwards; the shared lane_test is only read.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { requireTestDatabase } from "../../src/test/test-database";

const KIT = path.resolve(__dirname, "kit.mts");

/** A password made up for the tests. A local server that trusts its socket ignores it; it must never be printed. */
export const MADE_UP_PASSWORD = "made-up-rehearsal-password-411";

export type Scratch = Readonly<{
  /** The scratch database's connection string, as Nikhil would copy it. */
  url: string;
  database: string;
  /** A client on the scratch database, for arranging rows and checking what changed. */
  sql: ReturnType<typeof postgres>;
  /** The folder standing in for request-attachments. */
  folder: string;
  drop: () => Promise<void>;
}>;

function serverUrl(database: string): URL {
  const target = requireTestDatabase(process.env.DATABASE_URL);
  const url = new URL(target.url);
  url.pathname = `/${database}`;
  return url;
}

/** Creates a database from this checkout's lane_test (schema, grants, policies and fixtures) and an empty folder. */
export async function makeScratch(): Promise<Scratch> {
  const template = requireTestDatabase(process.env.DATABASE_URL).database;
  const database = `lane_rehearsal_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(serverUrl("postgres").toString(), { max: 1, prepare: false, onnotice: () => {} });
  try {
    // A template copy needs nobody else on lane_test; an earlier test file's pool may take a moment to close.
    for (let attempt = 0; ; attempt++) {
      try {
        await admin.unsafe(`create database "${database}" template "${template}"`);
        break;
      } catch (error) {
        if (attempt >= 20 || !/being accessed by other users/.test(String(error))) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  } finally {
    await admin.end();
  }
  const url = serverUrl(database);
  if (!url.password) url.password = MADE_UP_PASSWORD;
  const sql = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });
  const folder = mkdtempSync(path.join(tmpdir(), "lane_rehearsal_"));
  return {
    url: url.toString(),
    database,
    sql,
    folder,
    drop: async () => {
      await sql.end();
      rmSync(folder, { recursive: true, force: true });
      const cleanup = postgres(serverUrl("postgres").toString(), { max: 1, prepare: false, onnotice: () => {} });
      try {
        await cleanup.unsafe(`drop database if exists "${database}" with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

/** A working folder for the kit (its step logs and owner-only secret file), removed afterwards. */
export function makeWorkingFolder(): string {
  return mkdtempSync(path.join(tmpdir(), "lane-cutover-kit-"));
}

/** Puts a file in the stand-in bucket folder. */
export function putFile(folder: string, objectPath: string, bytes: string): void {
  const file = path.join(folder, objectPath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

/** Every file under a folder with its size and modification time, to show nothing in it changed. */
export function snapshotFolder(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const stat = statSync(full);
        files[path.relative(folder, full)] = `${stat.size}:${stat.mtimeMs}:${readFileSync(full, "base64")}`;
      }
    }
  };
  walk(folder);
  return files;
}

export type KitRun = Readonly<{ code: number | null; stdout: string; stderr: string; clipboard: string }>;

/**
 * Runs `node scripts/cutover/kit.mts <args> --dir <dir>` as the runbook does. Each time the kit asks for something
 * to be copied, the next value goes on the stand-in clipboard and Enter is pressed. When the values run out, the
 * kit's input is closed. `clipboard` is what the stand-in clipboard holds once the kit has exited.
 */
export function runKit(args: string[], options: { dir: string; clipboard?: string[] }): Promise<KitRun> {
  const clipboardDir = mkdtempSync(path.join(tmpdir(), "lane-cutover-clipboard-"));
  const clipboardFile = path.join(clipboardDir, "clipboard");
  writeFileSync(clipboardFile, "");
  const queue = [...(options.clipboard ?? [])];
  const child = spawn(process.execPath, [KIT, ...args, "--dir", options.dir], {
    cwd: path.resolve(__dirname, "../.."),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LANE_CUTOVER_CLIPBOARD: clipboardFile },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let prompts = 0;
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    const asked = stderr.match(/press Enter/g)?.length ?? 0;
    while (prompts < asked) {
      prompts++;
      const next = queue.shift();
      if (next === undefined) child.stdin.end();
      else {
        writeFileSync(clipboardFile, next);
        child.stdin.write("\n");
      }
    }
  });
  child.stdin.on("error", () => {});
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      const clipboard = readFileSync(clipboardFile, "utf8");
      rmSync(clipboardDir, { recursive: true, force: true });
      resolve({ code, stdout, stderr, clipboard });
    });
  });
}

/** Every line of a target's step log, parsed. */
export function stepLog(dir: string, environment: string): Record<string, unknown>[] {
  try {
    return readFileSync(path.join(dir, environment, "steps.log"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Every public table's row count, to show a run changed nothing in the database. */
export async function tableRows(sql: Scratch["sql"]): Promise<Record<string, number>> {
  const rows = await sql<{ name: string; rows: string }[]>`
    select c.relname as name,
      (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text as rows
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;
  return Object.fromEntries(rows.map((row) => [row.name, Number(row.rows)]));
}
