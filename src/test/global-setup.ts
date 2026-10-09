import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "path";
import { buildLocalBaseline } from "./local-baseline";

const DB_NAME = "lane_test";
const BASELINE_PATH = path.resolve(__dirname, "../db/baseline.sql");
const CLERK_CUTOVER_PATH = path.resolve(
  __dirname,
  "../db/migrations/0013_clerk_clean_cutover.sql"
);
const CLERK_SAFEGUARDS_PATH = path.resolve(
  __dirname,
  "../db/migrations/0014_restore_clerk_table_safeguards.sql"
);
const PROJECTS_PATH = path.resolve(__dirname, "../db/migrations/0015_request_projects_and_types.sql");
const EXPECTED_IMPACT_PATH = path.resolve(__dirname, "../db/migrations/0016_request_expected_impact.sql");
const REQUEST_CODES_PATH = path.resolve(__dirname, "../db/migrations/0017_request_codes.sql");
const DESIGN_REVIEWS_PATH = path.resolve(__dirname, "../db/migrations/0018_request_design_reviews.sql");
const FIXTURES_PATH = path.resolve(__dirname, "../db/test-fixtures.sql");

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
  sql([], baseline);
  // Do not let a hosted-project convenience trigger hide missing RLS in the
  // canonical migrations. Fresh databases must be protected by the SQL itself.
  sql(["-c", "DROP EVENT TRIGGER IF EXISTS ensure_rls"]);
  sql(["-f", CLERK_CUTOVER_PATH]);
  sql(["-f", CLERK_SAFEGUARDS_PATH]);
  sql(["-f", PROJECTS_PATH]);
  sql(["-f", EXPECTED_IMPACT_PATH]);
  sql(["-f", REQUEST_CODES_PATH]);
  sql(["-f", DESIGN_REVIEWS_PATH]);
  sql(["-f", FIXTURES_PATH]);

  console.log(
    `[test-setup] ${DB_NAME} reset from canonical local prerequisites + Clerk cutover/safeguards + Projects/expected impact/Request codes/design reviews migrations + test fixtures (not a hosted restore)`
  );
}
