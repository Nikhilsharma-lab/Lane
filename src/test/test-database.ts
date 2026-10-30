import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";

/** Pure naming: callers must supply the canonical real checkout root. */
export function testDatabaseFor(checkoutRoot: string): string {
  const readable = path.basename(checkoutRoot).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "checkout";
  const digest = createHash("sha256").update(checkoutRoot).digest("hex").slice(0, 20);
  return `lane_test_${readable}_${digest}`;
}

export function checkoutRootFor(cwd: string): string {
  try {
    const root = execFileSync("git", ["-C", realpathSync(cwd), "rev-parse", "--show-toplevel"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))), NODE_ENV: process.env.NODE_ENV },
    }).trim();
    return realpathSync(root);
  } catch {
    throw new Error("[test-target] Cannot identify the real Git checkout; refusing database access.");
  }
}

export type TestDatabaseTarget = Readonly<{
  checkoutRoot: string;
  database: string;
  url: string;
  host: string;
  port: string;
}>;

/** Configuration alone may replace the placeholder; consumers require the exact assigned target. */
export function resolveTestDatabase(databaseUrl: string | undefined, cwd = process.cwd()): TestDatabaseTarget {
  const checkoutRoot = checkoutRootFor(cwd);
  const database = testDatabaseFor(checkoutRoot);
  try {
    if (!databaseUrl || /[?#]/.test(databaseUrl)) throw new Error();
    const url = new URL(databaseUrl);
    if (url.pathname === "/lane_test") url.pathname = `/${database}`;
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.username || !decodeURIComponent(url.username) ||
      (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) ||
      url.pathname !== `/${database}`) throw new Error();
    decodeURIComponent(url.password);
    // An omitted port lets Postgres.js inherit PGPORT, unlike reset and locks.
    // Publish the same explicit default in every consumer's connection URL.
    url.port ||= "5432";
    return { checkoutRoot, database, url: url.toString(), host: url.hostname, port: url.port };
  } catch {
    throw new Error(`[test-target] Refusing database access: require loopback PostgreSQL, an explicit user, a valid port, no query/fragment, and this checkout's database ${database} (or the /lane_test configuration placeholder).`);
  }
}

export function isLocalTestDatabase(databaseUrl: string | undefined, cwd = process.cwd()): boolean {
  try {
    const target = resolveTestDatabase(databaseUrl, cwd);
    return new URL(databaseUrl!).pathname === `/${target.database}`;
  } catch {
    return false;
  }
}

/** Reset and database tests must consume configuration's resolved URL, never a placeholder. */
export function requireTestDatabase(databaseUrl: string | undefined, cwd = process.cwd()): TestDatabaseTarget {
  const target = resolveTestDatabase(databaseUrl, cwd);
  if (new URL(databaseUrl!).pathname !== `/${target.database}`) {
    throw new Error(`[test-target] Configuration must resolve this checkout's database ${target.database} before access.`);
  }
  return target;
}
