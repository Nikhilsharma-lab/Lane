import * as z from "zod";
import { BETTER_AUTH_NAMES, STRIPE_NAMES } from "./feature-switches";
import { TURNSTILE_SITE_KEY_NAME } from "./turnstile-site-key";

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
// Better Auth reads its names trimmed (src/lib/feature-switches.ts), so a blank one is unset.
const filled = z.string().trim().min(1);

/** Better Auth's names and Turnstile's public site key: what Lane needs to sign anyone in (#398). */
const SIGN_IN_NAMES = [...BETTER_AUTH_NAMES, TURNSTILE_SITE_KEY_NAME] as const;

const baseSchema = z.object({
  ...(Object.fromEntries(SIGN_IN_NAMES.map((name) => [name, filled])) as Record<(typeof SIGN_IN_NAMES)[number], typeof filled>),
  NEXT_PUBLIC_SUPABASE_URL: present,
  SUPABASE_SECRET_KEY: present,
  DATABASE_URL: present,
  ANTHROPIC_API_KEY: present,
  TRIAGE_TOKEN_SECRET: present,
  NEXT_PUBLIC_APP_URL: present,
});

// Missing KV disables AI review at runtime everywhere (src/lib/rate-limit.ts).
// Production also rejects it at startup; local/preview can run non-AI screens.
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
  if (production && !env.NEXT_PUBLIC_SENTRY_DSN) {
    warnings.push(
      "NEXT_PUBLIC_SENTRY_DSN is not set. Errors will not reach GlitchTip (src/lib/error-reporting.ts).",
    );
  }

  // #206: Inbox email is off by default (src/lib/feature-switches.ts). Switched on, it needs these names.
  if (env.LANE_EMAIL_DELIVERY === "1") {
    const unset = ["RESEND_API_KEY", "LANE_EMAIL_FROM", "CRON_SECRET"].filter((name) => !env[name]?.trim());
    if (unset.length)
      warnings.push(
        `LANE_EMAIL_DELIVERY is on but ${unset.join(", ")} ${unset.length === 1 ? "is" : "are"} not set. Without the Resend names nothing is sent; without CRON_SECRET the daily Inbox job refuses every call.`,
      );
  }

  // #358: auth email (src/lib/auth-email.ts) sends only with both names.
  const authEmailUnset = ["RESEND_API_KEY", "LANE_AUTH_EMAIL_FROM"].filter((name) => !env[name]?.trim());
  if (authEmailUnset.length === 1)
    warnings.push(
      `Auth email is half configured: ${authEmailUnset[0]} is not set, so no sign-up, sign-in, reset or invitation email is sent.`,
    );

  // #371, #377: the schema above names what's missing; this says what each one's absence costs.
  if (env.BETTER_AUTH_SECRET?.trim()) {
    const unset = SIGN_IN_NAMES.filter((name) => name !== "BETTER_AUTH_SECRET" && !env[name]?.trim());
    if (unset.length)
      warnings.push(
        `BETTER_AUTH_SECRET is set but ${unset.join(", ")} ${unset.length === 1 ? "is" : "are"} not set. Without the Google names there is no Google sign-in; without the Turnstile secret, sign-up and every code send are refused; without the Turnstile site key, the screens can’t show the human check, so they offer only password and Google sign-in.`,
      );
  }

  // #207: Slack DM is off by default (src/lib/feature-switches.ts). Switched on, it needs these names.
  if (env.LANE_SLACK_DELIVERY === "1") {
    const unset = ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "LANE_SLACK_TOKEN_KEY"].filter((name) => !env[name]?.trim());
    if (unset.length)
      warnings.push(
        `LANE_SLACK_DELIVERY is on but ${unset.join(", ")} ${unset.length === 1 ? "is" : "are"} not set. Without them Slack stays unavailable: no connect button, no Slack DM choice, nothing sent to Slack.`,
      );
  }

  // #214: billing enforced with no payment provider leaves a workspace whose Free Requests are used no way to pay.
  if (env.LANE_BILLING_ENFORCED === "1") {
    const unset = STRIPE_NAMES.filter((name) => !env[name]?.trim());
    if (unset.length)
      warnings.push(
        `LANE_BILLING_ENFORCED is on but ${unset.join(", ")} ${unset.length === 1 ? "is" : "are"} not set. Without them nobody can pay, so a workspace whose Free Requests are used can't create Requests.`,
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
