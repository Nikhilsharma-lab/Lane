// The local tools the kit runs (#410): pg_dump, pg_restore and psql for the database, gpg for the export. Each gets
// a clean environment rather than the shell's, so no PG* setting Nikhil has (PGPASSWORD, PGSERVICE, PGOPTIONS) can
// change where it connects. Database credentials reach the pg tools only through the owner-only pgpass file.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { supabaseCa } from "./database.mts";
import type { DatabaseTarget } from "./environments.mts";

export type Tool = "pg_dump" | "pg_restore" | "psql" | "gpg";

export type ToolOptions = Readonly<{
  env: NodeJS.ProcessEnv;
  /** "inherit" lets the tool ask Nikhil something on his terminal (gpg's passphrase). Default "ignore". */
  stdin?: "inherit" | "ignore";
  /** Reads the tool's output as it comes, instead of collecting it. */
  stdout?: (output: Readable) => Promise<void>;
}>;

/** Runs a tool and waits for it. A non-zero exit throws, with the end of what the tool said on stderr. */
export async function runTool(tool: Tool, args: readonly string[], options: ToolOptions): Promise<string> {
  const child = spawn(tool, args, { env: options.env, stdio: [options.stdin ?? "ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  let reading = Promise.resolve();
  if (options.stdout) {
    reading = options.stdout(child.stdout).catch((error) => {
      child.kill();
      throw error;
    });
  } else child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  const [code] = await Promise.all([exited, reading]);
  if (code !== 0) {
    const said = stderr.trim().split("\n").slice(-6).join("\n");
    throw new Error(`${tool} failed (exit ${code})${said ? `:\n${said}` : "."}`);
  }
  return stdout;
}

export type PgConnection = Readonly<{
  /** --host, --port, --username and --no-password: never a URL or a password. */
  args: readonly string[];
  env: NodeJS.ProcessEnv;
}>;

/**
 * How a pg tool reaches `target`: credentials from the pgpass file, verified TLS for a hosted target (Supabase's CA,
 * written beside the pgpass file, or the system's), none on loopback. Pass `--dbname` separately.
 */
export function pgConnection(target: DatabaseTarget, pgpassFile: string): PgConnection {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PGPASSFILE: pgpassFile, PGTZ: "UTC", PGCONNECT_TIMEOUT: "20", PGAPPNAME: "lane-cutover-kit" };
  if (target.local) env.PGSSLMODE = "disable";
  else {
    const ca = supabaseCa()?.trim();
    const caFile = path.join(path.dirname(pgpassFile), "supabase-ca.pem");
    if (ca) writeFileSync(caFile, `${ca}\n`, { mode: 0o600 });
    Object.assign(env, { PGSSLMODE: "verify-full", PGSSLROOTCERT: ca ? caFile : "system" });
  }
  return { args: ["--host", target.host, "--port", String(target.port), "--username", target.user, "--no-password"], env };
}
