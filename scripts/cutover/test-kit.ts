// The cutover kit's test setup (#411): a scratch database copied from this checkout's lane_test database, a scratch
// folder standing in for the bucket, a working folder for the step log, and a way to run the kit as the runbook
// does, with a stand-in clipboard. Every scratch thing is dropped afterwards; the shared lane_test is only read.
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { buildLocalBaseline } from "../../src/test/local-baseline";
import { migrationPlan } from "../../src/test/migration-plan";
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

/** The local server's postgres database, as Nikhil would copy it for a rehearsal's throwaway copy. */
export function localServerUrl(): string {
  const url = serverUrl("postgres");
  if (!url.password) url.password = MADE_UP_PASSWORD;
  return url.toString();
}

/**
 * Builds `database` as lane_test is reset (src/test/global-setup.ts), stopping before 0055: an environment as it
 * stands before the cutover applies Better Auth, with the same fixtures.
 */
function buildBefore0055(database: string): void {
  const url = serverUrl(database);
  const env = { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PGPASSWORD: decodeURIComponent(url.password), PGPASSFILE: path.join(tmpdir(), "lane-no-pgpass") };
  const connection = ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--no-password"];
  const psql = (args: string[], input?: string) =>
    execFileSync("psql", [...connection, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { env, input, stdio: ["pipe", "pipe", "pipe"] });
  psql(["--dbname", "postgres", "-c", `create database "${database}" template template0`]);
  psql(["--dbname", database, "-c", "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$"]);
  psql(["--dbname", database], buildLocalBaseline(readFileSync(path.resolve(__dirname, "../../src/db/baseline.sql"), "utf8")));
  psql(["--dbname", database, "-c", "DROP EVENT TRIGGER IF EXISTS ensure_rls"]);
  for (const file of migrationPlan().filter((file) => !path.basename(file).startsWith("0055_"))) psql(["--dbname", database, "-f", file]);
}

/**
 * Creates a scratch database and an empty folder. The database is a copy of this checkout's lane_test (schema,
 * grants, policies and fixtures, at 0055), or with `before0055` one built the same way that stops at 0054.
 */
export async function makeScratch(options: { before0055?: boolean } = {}): Promise<Scratch> {
  const template = requireTestDatabase(process.env.DATABASE_URL).database;
  const database = `lane_rehearsal_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(serverUrl("postgres").toString(), { max: 1, prepare: false, onnotice: () => {} });
  try {
    if (options.before0055) buildBefore0055(database);
    // A template copy needs nobody else on lane_test; an earlier test file's pool may take a moment to close.
    else for (let attempt = 0; ; attempt++) {
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

/** Puts a file in the stand-in bucket folder, with its content type when one is given. */
export function putFile(folder: string, objectPath: string, bytes: string | Buffer, contentType?: string): void {
  const file = path.join(folder, objectPath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  if (contentType) {
    const typesFile = path.join(folder, ".content-types.json");
    let types: Record<string, string> = {};
    try {
      types = JSON.parse(readFileSync(typesFile, "utf8"));
    } catch {}
    writeFileSync(typesFile, JSON.stringify({ ...types, [objectPath]: contentType }));
  }
}

/** A passphrase made up for the tests. It must never be printed, logged or passed as an argument. */
export const MADE_UP_PASSPHRASE = "made-up-export-passphrase-412";

export type Gnupg = Readonly<{
  /** For runKit: a gpg home of its own, and the file standing in for Nikhil typing the passphrase. */
  env: Readonly<Record<string, string>>;
  /** Runs gpg as Nikhil could by hand, in the same home and with the same passphrase. */
  gpg: (args: string[]) => Buffer;
  close: () => void;
}>;

/**
 * A gpg home for one test file, so the tests never touch Nikhil's own keyring or agent, and a passphrase file that
 * stands in for gpg asking him (LANE_CUTOVER_PASSPHRASE_FILE). `close` stops its agent and deletes both.
 */
export function makeGnupg(): Gnupg {
  const home = mkdtempSync(path.join(tmpdir(), "lane-gnupg-"));
  const passphraseFile = path.join(home, "passphrase");
  writeFileSync(passphraseFile, MADE_UP_PASSPHRASE, { mode: 0o600 });
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: process.env.NODE_ENV, GNUPGHOME: home };
  return {
    env: { GNUPGHOME: home, LANE_CUTOVER_PASSPHRASE_FILE: passphraseFile },
    gpg: (args) =>
      execFileSync("gpg", ["--batch", "--pinentry-mode", "loopback", "--passphrase-file", passphraseFile, "--no-symkey-cache", ...args], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1 << 28,
      }),
    close: () => {
      try {
        execFileSync("gpgconf", ["--kill", "gpg-agent"], { env, stdio: "ignore" });
      } catch {}
      rmSync(home, { recursive: true, force: true });
    },
  };
}

/** The only export in a working folder's environment folder, with what's in it. */
export function onlyExport(dir: string, environment: string): { folder: string; name: string; entries: string[] } {
  const names = readdirSync(path.join(dir, environment)).filter((entry) => entry !== "steps.log");
  if (names.length !== 1) throw new Error(`Expected one export for ${environment}, found ${names.length}.`);
  const folder = path.join(dir, environment, names[0]);
  return { folder, name: names[0], entries: readdirSync(folder).sort() };
}

const tarEnv = () => ({ PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, COPYFILE_DISABLE: "1" });

/** Decrypts an export's archive and unpacks it with gpg and tar, as Nikhil could by hand without the kit. */
export function openExport(exportFolder: string, gnupg: Gnupg): string {
  const opened = mkdtempSync(path.join(tmpdir(), "lane-opened-export-"));
  const archive = readdirSync(exportFolder).find((entry) => entry.endsWith(".tar.gpg"))!;
  writeFileSync(path.join(opened, "archive.tar"), gnupg.gpg(["--decrypt", path.join(exportFolder, archive)]));
  mkdirSync(path.join(opened, "archive"));
  execFileSync("tar", ["-xf", path.join(opened, "archive.tar"), "-C", path.join(opened, "archive")], { env: tarEnv() });
  rmSync(path.join(opened, "archive.tar"));
  return path.join(opened, "archive");
}

/**
 * Packs a folder `openExport` gave (and a test changed) back into the export, as if the kit had exported it so:
 * tar, gpg, and the manifest beside the archive rewritten from the one inside, with the new archive's SHA256.
 */
export function sealExport(exportFolder: string, opened: string, gnupg: Gnupg): void {
  const archiveName = readdirSync(exportFolder).find((entry) => entry.endsWith(".tar.gpg"))!;
  const archive = path.join(exportFolder, archiveName);
  const inside = JSON.parse(readFileSync(path.join(opened, "manifest.json"), "utf8"));
  const beside = JSON.parse(readFileSync(path.join(exportFolder, "manifest.json"), "utf8"));
  const tar = path.join(path.dirname(opened), "archive.tar");
  execFileSync("tar", ["--format=ustar", "-cf", tar, "-C", opened, ...readdirSync(opened).sort()], { env: tarEnv() });
  rmSync(archive);
  gnupg.gpg(["--symmetric", "--cipher-algo", "AES256", "--output", archive, tar]);
  rmSync(path.dirname(opened), { recursive: true, force: true });
  const bytes = readFileSync(archive);
  writeFileSync(path.join(exportFolder, "manifest.json"), JSON.stringify({ ...inside, archive: { ...beside.archive, sha256: sha256(bytes), bytes: bytes.length } }, null, 2));
}

/** The SHA256 of some bytes, as `shasum -a 256` gives it. */
export function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
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
 * kit's input is closed. `clipboard` is what the stand-in clipboard holds once the kit has exited. `atPrompt` runs
 * as each prompt appears (0 for the first); returning "terminate" stops the kit with SIGTERM instead of answering.
 */
export function runKit(
  args: string[],
  options: { dir: string; clipboard?: string[]; atPrompt?: (index: number) => "terminate" | void; env?: Readonly<Record<string, string>> },
): Promise<KitRun> {
  const clipboardDir = mkdtempSync(path.join(tmpdir(), "lane-cutover-clipboard-"));
  const clipboardFile = path.join(clipboardDir, "clipboard");
  writeFileSync(clipboardFile, "");
  const queue = [...(options.clipboard ?? [])];
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [KIT, ...args, "--dir", options.dir], {
    cwd: path.resolve(__dirname, "../.."),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: process.env.NODE_ENV, ...options.env, LANE_CUTOVER_CLIPBOARD: clipboardFile },
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
      const index = prompts++;
      if (options.atPrompt?.(index) === "terminate") {
        child.kill("SIGTERM");
        return;
      }
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

/** Every public table's row count and a digest of its rows, to show a run changed nothing in the database. */
export async function tableDigests(sql: Scratch["sql"]): Promise<Record<string, string>> {
  const rows = await sql<{ name: string; digest: string }[]>`
    select c.relname as name,
      (xpath('/row/d/text()', query_to_xml(format(
        'select count(*) || '':'' || coalesce(md5(string_agg(to_jsonb(t)::text, '','' order by to_jsonb(t)::text)), '''') as d from public.%I t',
        c.relname), false, true, '')))[1]::text as digest
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;
  return Object.fromEntries(rows.map((row) => [row.name, row.digest]));
}
