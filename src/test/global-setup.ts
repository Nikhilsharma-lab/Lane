import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "path";
import { buildLocalBaseline } from "./local-baseline";
import { migrationPlan } from "./migration-plan";

const DB_NAME = "lane_test";
const BASELINE_PATH = path.resolve(__dirname, "../db/baseline.sql");

function getPgBinDir(): string {
  const candidates = [
    "/opt/homebrew/opt/postgresql@17/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
  for (const dir of candidates) {
    try {
      execFileSync(`${dir}/psql`, ["--version"], { stdio: "pipe" });
      return dir;
    } catch {}
  }
  throw new Error(
    "[test-setup] psql not found. Install PostgreSQL: brew install postgresql@17"
  );
}

export async function setup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "[test-setup] DATABASE_URL is not set. Ensure .env.test exists and vitest.config.ts loads it."
    );
  }

  const url = new URL(dbUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== `/${DB_NAME}` ||
    !url.username || url.search || url.hash ||
    (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))
  ) {
    throw new Error(
      "[test-setup] Refusing reset: require a loopback PostgreSQL URL with an explicit user, database lane_test, and no query or fragment."
    );
  }

  // The reset and the tests must use the same target. Never inherit libpq
  // service/host/options settings or interpolate credentials into a shell.
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  // Validate the canonical prerequisites before any destructive subprocess.
  const baseline = buildLocalBaseline(readFileSync(BASELINE_PATH, "utf8"));
  const plan = migrationPlan();
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("PG"))
  ), NODE_ENV: process.env.NODE_ENV };
  env.PGPASSWORD = password;
  env.PGPASSFILE = path.join(__dirname, ".no-test-password-file");
  const connection = [
    "--host", url.hostname, "--port", url.port || "5432",
    "--username", username, "--no-password",
  ];
  const pgBin = getPgBinDir();
  const run = (binary: string, args: string[], input?: string) =>
    execFileSync(`${pgBin}/${binary}`, [...connection, ...args], { env, input, stdio: "pipe" });
  const sql = (args: string[], input?: string) => run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "--dbname", DB_NAME, ...args], input);

  run("dropdb", ["--if-exists", DB_NAME]);
  run("createdb", [DB_NAME]);
  // Supabase creates the anon and authenticated roles in every project, and
  // 0028_request_agreements.sql revokes from them directly. A bare PostgreSQL
  // (CI's postgres:17 service) has neither, so create them, only when missing
  // and never with a login. Roles are cluster-wide; this runs over the same
  // validated lane_test connection as every other statement. Earlier
  // migrations guard their grants with IF EXISTS and are unaffected.
  sql(["-c", "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$"]);
  sql([], baseline);
  // Do not let a hosted-project convenience trigger hide missing RLS in the
  // canonical migrations. Fresh databases must be protected by the SQL itself.
  sql(["-c", "DROP EVENT TRIGGER IF EXISTS ensure_rls"]);
  // Every migration from 0013, each after the fixtures it must find (migration-plan.ts).
  for (const file of plan) sql(["-f", file]);

  const migrations = plan.filter((file) => file.includes("/db/migrations/")).map((file) => path.basename(file, ".sql").slice(0, 4));
  console.log(
    `[test-setup] ${DB_NAME} reset from canonical local prerequisites + migrations ${migrations[0]}–${migrations.at(-1)} + test fixtures (not a hosted restore)`
  );
}
