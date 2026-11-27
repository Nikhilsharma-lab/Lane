// What each cutover target is, and the checks that refuse anything else (#410 "Targets"). Every check here runs
// before the kit connects, writes or logs anything, and no message names the value it refused.
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export type Environment = "staging" | "production" | "rehearsal";
export type HostedEnvironment = Exclude<Environment, "rehearsal">;

export const ENVIRONMENTS: readonly Environment[] = ["staging", "production", "rehearsal"];
export const PROJECT_REFS: Readonly<Record<HostedEnvironment, string>> = {
  staging: "jznepeqghjixcrpuddym",
  production: "tcfwabpoiydvfqxhtkur",
};
export const ENVIRONMENT_NAMES: Readonly<Record<Environment, string>> = {
  staging: "Lane Staging",
  production: "Lane production",
  rehearsal: "a local rehearsal",
};

/** A throwaway rehearsal database or folder is named so; nothing else local is one. */
export const REHEARSAL_PREFIX = "lane_rehearsal_";

/** The kit refused a target or an input. Nothing was touched. */
export class Refusal extends Error {}

export type DatabaseTarget = Readonly<{
  environment: Environment;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Loopback, so no TLS. */
  local: boolean;
}>;

// As src/db/database-url.ts: a string copied from a dashboard can carry characters nobody sees (a U+2028 line separator
// took production down on 2026-10-26). The kit can't import that file: Node would warn about its module type.
const EDGE_JUNK = /^[\s\u200b-\u200d\u2060\ufeff"']+|[\s\u200b-\u200d\u2060\ufeff"']+$/g;
const LOOPBACK = ["localhost", "127.0.0.1"];
const PLACEHOLDER = /YOUR[-_ ]?PASSWORD|[[\]<>]/i;
const nothingDone = "Nothing was done.";

export function isEnvironment(value: string | undefined): value is Environment {
  return ENVIRONMENTS.includes(value as Environment);
}

function hostedRef(url: URL, user: string): string | undefined {
  const pooler = /^postgres\.([a-z0-9]{20})$/.exec(user);
  if (pooler && url.hostname.endsWith(".pooler.supabase.com")) return pooler[1];
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (direct && user === "postgres") return direct[1];
  return undefined;
}

type Parsed = Readonly<{ url: URL; user: string; password: string; database: string; port: number; local: boolean }>;

function parseConnection(raw: string, name: string): Parsed {
  const cleaned = raw.replace(EDGE_JUNK, "");
  if (!cleaned) throw new Refusal(`The clipboard held no connection string for ${name}. ${nothingDone}`);
  if (PLACEHOLDER.test(cleaned)) throw new Refusal(`The connection string still has a placeholder such as [YOUR-PASSWORD]. ${nothingDone}`);
  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    throw new Refusal(`The clipboard doesn't hold a connection string. ${nothingDone}`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Refusal(`That isn't a Postgres connection string. ${nothingDone}`);
  if (url.search || url.hash) throw new Refusal(`The connection string has options after it (?…); copy it without them. ${nothingDone}`);
  let user: string, password: string, database: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Refusal(`The connection string isn't readable. ${nothingDone}`);
  }
  const port = Number(url.port || "5432");
  if (port === 6543) {
    throw new Refusal(`That is Supabase's transaction pooler (port 6543). The kit needs the session pooler (port 5432) or the direct connection. ${nothingDone}`);
  }
  if (!user) throw new Refusal(`The connection string names no user. ${nothingDone}`);
  return { url, user, password, database, port, local: LOOPBACK.includes(url.hostname) };
}

/** The database `raw` names, if and only if it is `environment`'s. */
export function databaseTarget(environment: Environment, raw: string): DatabaseTarget {
  const name = ENVIRONMENT_NAMES[environment];
  const { url, user, password, database, port, local } = parseConnection(raw, name);

  if (environment === "rehearsal") {
    if (!local || !new RegExp(`^${REHEARSAL_PREFIX}[a-z0-9_]+$`).test(database)) {
      throw new Refusal(`A rehearsal runs only on a throwaway local database named ${REHEARSAL_PREFIX}…. ${nothingDone}`);
    }
    return { environment, host: url.hostname, port, user, password, database, local };
  }

  const ref = hostedRef(url, user);
  const other = (Object.keys(PROJECT_REFS) as HostedEnvironment[]).find((key) => key !== environment && PROJECT_REFS[key] === ref);
  if (other) throw new Refusal(`That is ${ENVIRONMENT_NAMES[other]}'s database (${PROJECT_REFS[other]}), not ${name}'s (${PROJECT_REFS[environment]}). ${nothingDone}`);
  if (ref !== PROJECT_REFS[environment]) throw new Refusal(`That isn't ${name}'s database (project ${PROJECT_REFS[environment]}). ${nothingDone}`);
  if (port !== 5432 || database !== "postgres") throw new Refusal(`That isn't ${name}'s session connection (port 5432, database postgres). ${nothingDone}`);
  if (!password) throw new Refusal(`The connection string has no password. ${nothingDone}`);
  return { environment, host: url.hostname, port, user, password, database, local };
}

/**
 * The local Postgres server `raw` names, where a rehearsal makes its throwaway copy: loopback only, never hosted.
 * The kit connects to the database it names only to create and drop throwaway lane_rehearsal_… databases.
 */
export function localServer(raw: string): DatabaseTarget {
  const { url, user, password, database, port, local } = parseConnection(raw, "the local Postgres server");
  if (!local) throw new Refusal(`A rehearsal's throwaway copy is made only on the local Postgres server (127.0.0.1 or localhost). ${nothingDone}`);
  return { environment: "rehearsal", host: url.hostname, port, user, password, database: database || "postgres", local };
}

/** Supabase's secret key for `environment`'s storage: a secret key, or a legacy service_role key for that project. */
export function storageKey(environment: HostedEnvironment, raw: string): string {
  const name = ENVIRONMENT_NAMES[environment];
  const key = raw.trim();
  if (!key) throw new Refusal(`The clipboard held no storage key for ${name}. ${nothingDone}`);
  if (PLACEHOLDER.test(key) || /placeholder/i.test(key)) throw new Refusal(`The storage key is a placeholder. ${nothingDone}`);
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return key;
  const parts = key.split(".");
  if (parts.length === 3) {
    let claims: { ref?: unknown; role?: unknown } = {};
    try {
      claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {}
    const other = (Object.keys(PROJECT_REFS) as HostedEnvironment[]).find((env) => env !== environment && PROJECT_REFS[env] === claims.ref);
    if (other) throw new Refusal(`That is ${ENVIRONMENT_NAMES[other]}'s storage key, not ${name}'s. ${nothingDone}`);
    if (claims.ref === PROJECT_REFS[environment] && claims.role === "service_role") return key;
  }
  throw new Refusal(`That isn't ${name}'s Supabase secret key (sb_secret_…). ${nothingDone}`);
}

/** The local folder that stands in for the bucket in a rehearsal: an existing folder named lane_rehearsal_…. */
export function rehearsalFolder(folder: string | undefined): string {
  if (!folder) throw new Refusal(`A rehearsal needs --folder, the local folder standing in for request-attachments. ${nothingDone}`);
  const resolved = path.resolve(folder);
  if (!path.basename(resolved).startsWith(REHEARSAL_PREFIX)) {
    throw new Refusal(`A rehearsal folder is a throwaway one named ${REHEARSAL_PREFIX}…. ${nothingDone}`);
  }
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) throw new Refusal(`The rehearsal folder doesn't exist. ${nothingDone}`);
  return realpathSync(resolved);
}
