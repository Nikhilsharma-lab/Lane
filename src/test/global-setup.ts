import { execSync } from "child_process";
import path from "path";

const DB_NAME = "lane_test";
const BASELINE_PATH = path.resolve(__dirname, "../db/baseline.sql");
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
      execSync(`${dir}/psql --version`, { stdio: "pipe" });
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
  const host = url.hostname;

  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `[test-setup] FATAL: DATABASE_URL points to "${host}" — refusing to run tests against a non-local database. ` +
        `Tests must target localhost. Check .env.test.`
    );
  }

  const pgBin = getPgBinDir();

  execSync(`${pgBin}/dropdb --if-exists ${DB_NAME}`, { stdio: "pipe" });
  execSync(`${pgBin}/createdb ${DB_NAME}`, { stdio: "pipe" });
  execSync(`${pgBin}/psql -d ${DB_NAME} -f "${BASELINE_PATH}"`, { stdio: "pipe" });
  execSync(`${pgBin}/psql -d ${DB_NAME} -f "${FIXTURES_PATH}"`, { stdio: "pipe" });

  console.log(`[test-setup] ${DB_NAME} reset from baseline.sql + test-fixtures.sql`);
}
