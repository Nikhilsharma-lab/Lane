export const STAGING_SUPABASE_REF = "jznepeqghjixcrpuddym";

type DatabaseEnv = Record<string, string | undefined>;

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLaneStagingUrl(url: URL) {
  const user = decodeURIComponent(url.username ?? "");
  return (
    url.hostname.includes(STAGING_SUPABASE_REF) ||
    user.includes(STAGING_SUPABASE_REF)
  );
}

export function assertSafeDatabaseUrl(
  databaseUrl: string,
  env: DatabaseEnv = process.env
): void {
  const url = new URL(databaseUrl);
  if (isLocalHost(url.hostname) || isLaneStagingUrl(url)) return;
  if (env.LANE_ALLOW_HOSTED_DB === "1") return;
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return;

  throw new Error(
    "[db] Refusing a non-staging hosted DATABASE_URL in a local/dev process. Point it at localhost or Lane Staging, or set LANE_ALLOW_HOSTED_DB=1 if you intend this."
  );
}
