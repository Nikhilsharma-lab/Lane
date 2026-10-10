import { clerkClient } from "@clerk/nextjs/server";

// Explicit identities, not substring matches or a production bypass flag.
const STAGING_REF = "jznepeqghjixcrpuddym";
const CLERK_INSTANCE = "ins_3JlFEUdZ5q4X4z6DI7c8i7k0tYZ";
const CLERK_HOST = "thankful-caiman-3665.clerk.accounts.dev";

export function assertE2ETarget(env: NodeJS.ProcessEnv = process.env) {
  const fail = (): never => {
    throw new Error(
      "[e2e] Refusing remote fixtures: require explicit opt-in and the pinned Lane staging database, URL and Clerk development instance."
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
  const base = parse(env.E2E_BASE_URL || "http://localhost:3100");
  if (
    !["http://localhost:3100", "http://127.0.0.1:3100", "https://lane-staging.vercel.app"].includes(base.origin) ||
    base.pathname !== "/" || base.search || base.hash || base.username || base.password
  ) fail();
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) return fail();
  const db = parse(databaseUrl);
  const user = decodeURIComponent(db.username);
  const pinnedDatabase =
    (db.hostname === "aws-0-ap-northeast-1.pooler.supabase.com" && user === `postgres.${STAGING_REF}`) ||
    (db.hostname === `db.${STAGING_REF}.supabase.co` && user === "postgres");
  if (
    !pinnedDatabase || !["postgres:", "postgresql:"].includes(db.protocol) ||
    db.pathname !== "/postgres" || !["", "5432"].includes(db.port) || db.search || db.hash
  ) fail();
  const storage = parse(env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (
    storage.origin !== `https://${STAGING_REF}.supabase.co` || storage.pathname !== "/" ||
    storage.search || storage.hash || storage.username || storage.password
  ) fail();
  const pk = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  if (
    !pk.startsWith("pk_test_") ||
    Buffer.from(pk.slice(8), "base64").toString() !== `${CLERK_HOST}$` ||
    !env.CLERK_SECRET_KEY?.startsWith("sk_test_")
  ) fail();
  for (const key of ["CLERK_API_URL", "CLERK_FAPI", "CLERK_PROXY_URL", "NEXT_PUBLIC_CLERK_PROXY_URL"]) {
    if (env[key]) fail();
  }
  return { databaseUrl, baseURL: base.origin };
}

export async function safeClerkClient() {
  assertE2ETarget();
  const client = await clerkClient();
  // Prefixes cannot prove which instance the secret key belongs to.
  const instance = await client.instance.get();
  if (instance.id !== CLERK_INSTANCE || instance.environmentType !== "development") {
    throw new Error("[e2e] Clerk secret key does not belong to the pinned development instance.");
  }
  return client;
}
