import { z } from "zod";

/**
 * Server env check (plan 6.1, I4/I5).
 *
 * Validates the names the server needs before it takes traffic. It reports
 * key NAMES only and never reads a value into a message or a log line.
 * Wired from src/instrumentation.ts, which Next runs once per server start.
 */

type Env = Record<string, string | undefined>;

export type EnvCheck = {
  ok: boolean;
  /** Names that are unset or empty. */
  missing: string[];
  /** Readable notes about optional names worth setting. Names only. */
  warnings: string[];
};

export type EnvCheckOptions = {
  env?: Env;
  /** Vercel's deployment target. "production" turns on the stricter rules. */
  vercelEnv?: string;
};

const present = z.string().min(1);

const baseSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: present,
  CLERK_SECRET_KEY: present,
  NEXT_PUBLIC_SUPABASE_URL: present,
  SUPABASE_SECRET_KEY: present,
  DATABASE_URL: present,
  ANTHROPIC_API_KEY: present,
  TRIAGE_TOKEN_SECRET: present,
  NEXT_PUBLIC_APP_URL: present,
});

// The AI rate limiter fails open without KV (src/lib/rate-limit.ts). That is
// tolerable on a laptop or a preview, never on production.
const productionSchema = baseSchema.extend({
  KV_REST_API_URL: present,
  KV_REST_API_TOKEN: present,
});

export const REQUIRED_ENV_NAMES = Object.keys(baseSchema.shape);
export const PRODUCTION_ONLY_ENV_NAMES = ["KV_REST_API_URL", "KV_REST_API_TOKEN"];

export function checkServerEnv(options: EnvCheckOptions = {}): EnvCheck {
  const env = options.env ?? process.env;
  const vercelEnv = options.vercelEnv ?? env.VERCEL_ENV;
  const production = vercelEnv === "production";
  const schema = production ? productionSchema : baseSchema;

  const result = schema.safeParse(env);
  const missing = result.success
    ? []
    : Array.from(new Set(result.error.issues.map((issue) => String(issue.path[0]))));

  const warnings: string[] = [];
  if (production && !env.CLERK_JWT_KEY) {
    warnings.push(
      "CLERK_JWT_KEY is not set. Clerk will fetch its JWKS over the network on cold starts, which adds latency.",
    );
  }

  return { ok: missing.length === 0, missing, warnings };
}

export class MissingEnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`[env] Missing required environment variables: ${missing.join(", ")}`);
    this.name = "MissingEnvError";
    this.missing = missing;
  }
}

/** Throws with the missing names. Values are never included. */
export function assertServerEnv(options: EnvCheckOptions = {}): EnvCheck {
  const check = checkServerEnv(options);
  if (!check.ok) {
    throw new MissingEnvError(check.missing);
  }
  return check;
}

export type ReportOptions = EnvCheckOptions & {
  /** Node's NODE_ENV. "production" makes a missing name fatal. */
  nodeEnv?: string;
  log?: Pick<Console, "warn">;
};

/**
 * Boot-time entry point. Strict (throws) when NODE_ENV is "production";
 * otherwise prints one readable warning listing the missing names so local
 * work and tests are never blocked by an incomplete .env.local.
 */
export function reportServerEnv(options: ReportOptions = {}): EnvCheck {
  const env = options.env ?? process.env;
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV;
  const log = options.log ?? console;
  const strict = nodeEnv === "production";

  const check = strict ? assertServerEnv(options) : checkServerEnv(options);

  if (!check.ok) {
    log.warn(
      `[env] Missing environment variables (set them in .env.local, see .env.example): ${check.missing.join(", ")}`,
    );
  }
  for (const warning of check.warnings) {
    log.warn(`[env] ${warning}`);
  }

  return check;
}
