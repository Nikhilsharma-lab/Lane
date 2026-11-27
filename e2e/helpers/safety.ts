import { createHash } from "node:crypto";
import { STAGING_AUTH_SECRET_SHA256, STAGING_REF } from "./staging-pin";

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

/**
 * The one check before any fixture. A run targets Lane Staging (its database ref, its storage and, by fingerprint,
 * its BETTER_AUTH_SECRET) or, with LANE_E2E_LOCAL_DATABASE=1, a local `lane_test_*` database and a local app, whose
 * own secret it signs with. Anything else throws, saying what's wrong and never a value.
 */
export function assertE2ETarget(env: NodeJS.ProcessEnv = process.env) {
  const fail = (): never => {
    throw new Error(
      "[e2e] Refusing fixtures: require explicit opt-in, Lane Staging's storage, and either the pinned Lane staging database and URL or (LANE_E2E_LOCAL_DATABASE=1) a local lane_test_* database and local app."
    );
  };
  const parse = (value: string) => {
    try {
      return new URL(value);
    } catch {
      return fail();
    }
  };
  if (env.LANE_E2E_ALLOW_REMOTE !== "1") fail();
  // LANE_E2E_LOCAL_DATABASE=1: the app runs on this machine (any port) against a local `lane_test_*` database,
  // so a run touches neither Lane Staging's data nor its lagging schema.
  const localDatabase = env.LANE_E2E_LOCAL_DATABASE === "1";
  const base = parse(env.E2E_BASE_URL || "http://localhost:3100");
  const allowedBase = localDatabase
    ? base.protocol === "http:" && LOCAL_HOSTS.includes(base.hostname)
    : ["http://localhost:3100", "http://127.0.0.1:3100", "https://lane-staging.vercel.app"].includes(base.origin);
  if (!allowedBase || base.pathname !== "/" || base.search || base.hash || base.username || base.password) fail();
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) return fail();
  const db = parse(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(db.protocol) || db.search || db.hash) fail();
  if (localDatabase) {
    if (!LOCAL_HOSTS.includes(db.hostname) || !/^\/lane_test_\w+$/.test(db.pathname)) fail();
  } else {
    const user = decodeURIComponent(db.username);
    const pinnedDatabase =
      (db.hostname === "aws-0-ap-northeast-1.pooler.supabase.com" && user === `postgres.${STAGING_REF}`) ||
      (db.hostname === `db.${STAGING_REF}.supabase.co` && user === "postgres");
    if (!pinnedDatabase || db.pathname !== "/postgres" || !["", "5432"].includes(db.port)) fail();
  }
  const storage = parse(env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (
    storage.origin !== `https://${STAGING_REF}.supabase.co` || storage.pathname !== "/" ||
    storage.search || storage.hash || storage.username || storage.password
  ) fail();
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret?.trim())
    throw new Error("[e2e] Refusing fixtures: BETTER_AUTH_SECRET is not set. A local database takes any local one, from .env.local; staging needs Lane Staging's in .env.staging.local.");
  if (!localDatabase && createHash("sha256").update(secret, "utf8").digest("hex") !== STAGING_AUTH_SECRET_SHA256)
    throw new Error("[e2e] Refusing fixtures: BETTER_AUTH_SECRET is not Lane Staging's (its fingerprint isn't the one in e2e/helpers/staging-pin.ts).");
  // A local Postgres has no SSL; Lane Staging's always does.
  return { databaseUrl, baseURL: base.origin, ssl: localDatabase ? (false as const) : ("require" as const) };
}

/** The checked target's Better Auth secret, trimmed as the app reads it. Never print it. */
export function e2eAuthSecret(): string {
  assertE2ETarget();
  return process.env.BETTER_AUTH_SECRET!.trim();
}
