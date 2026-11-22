import { describe, expect, it, vi } from "vitest";

import {
  MissingEnvError,
  PRODUCTION_ONLY_ENV_NAMES,
  REQUIRED_ENV_NAMES,
  assertServerEnv,
  checkServerEnv,
  reportServerEnv,
} from "./env";

// Distinctive values so the "never logs values" assertions are meaningful.
const SENTINEL = "SENTINEL_VALUE_MUST_NOT_LEAK";

function completeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [
    ...REQUIRED_ENV_NAMES,
    ...PRODUCTION_ONLY_ENV_NAMES,
    "CLERK_JWT_KEY",
    "NEXT_PUBLIC_SENTRY_DSN",
  ]) {
    env[name] = `${SENTINEL}_${name}`;
  }
  return env;
}

describe("checkServerEnv", () => {
  it("passes when every name is present", () => {
    const check = checkServerEnv({ env: completeEnv(), vercelEnv: "production" });
    expect(check).toEqual({ ok: true, missing: [], warnings: [] });
  });

  it("lists every missing required name, including empty strings", () => {
    const env = completeEnv();
    delete env.CLERK_SECRET_KEY;
    delete env.DATABASE_URL;
    env.TRIAGE_TOKEN_SECRET = "";

    const check = checkServerEnv({ env, vercelEnv: "preview" });
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(["CLERK_SECRET_KEY", "DATABASE_URL", "TRIAGE_TOKEN_SECRET"]);
  });

  it("does not require KV outside production", () => {
    const env = completeEnv();
    delete env.KV_REST_API_URL;
    delete env.KV_REST_API_TOKEN;

    expect(checkServerEnv({ env, vercelEnv: undefined }).ok).toBe(true);
    expect(checkServerEnv({ env, vercelEnv: "preview" }).ok).toBe(true);
    expect(checkServerEnv({ env, vercelEnv: "development" }).ok).toBe(true);
  });

  it("requires KV at production startup so AI review is available", () => {
    const env = completeEnv();
    delete env.KV_REST_API_URL;
    env.KV_REST_API_TOKEN = "";

    const check = checkServerEnv({ env, vercelEnv: "production" });
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(["KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  });

  it("warns, but does not fail, when CLERK_JWT_KEY is missing in production", () => {
    const env = completeEnv();
    delete env.CLERK_JWT_KEY;

    const production = checkServerEnv({ env, vercelEnv: "production" });
    expect(production.ok).toBe(true);
    expect(production.warnings).toHaveLength(1);
    expect(production.warnings[0]).toContain("CLERK_JWT_KEY");

    expect(checkServerEnv({ env, vercelEnv: "preview" }).warnings).toEqual([]);
  });

  it("warns, but does not fail, when NEXT_PUBLIC_SENTRY_DSN is missing in production", () => {
    const env = completeEnv();
    delete env.NEXT_PUBLIC_SENTRY_DSN;

    const production = checkServerEnv({ env, vercelEnv: "production" });
    expect(production.ok).toBe(true);
    expect(production.warnings).toHaveLength(1);
    expect(production.warnings[0]).toContain("NEXT_PUBLIC_SENTRY_DSN");

    expect(checkServerEnv({ env, vercelEnv: "preview" }).warnings).toEqual([]);
  });

  it("warns, by name only, when Inbox email is switched on without what it needs (#206)", () => {
    const env = { ...completeEnv(), LANE_EMAIL_DELIVERY: "1" };
    const warnings = checkServerEnv({ env, vercelEnv: "preview" }).warnings;
    expect(warnings).toHaveLength(1);
    for (const name of ["RESEND_API_KEY", "LANE_EMAIL_FROM", "CRON_SECRET"]) expect(warnings[0]).toContain(name);
    expect(warnings.join(" ")).not.toContain(SENTINEL);

    // RESEND_API_KEY is shared with auth email, which warns on its own without LANE_AUTH_EMAIL_FROM (#358).
    const complete = { ...env, RESEND_API_KEY: SENTINEL, LANE_EMAIL_FROM: SENTINEL, CRON_SECRET: SENTINEL, LANE_AUTH_EMAIL_FROM: SENTINEL };
    expect(checkServerEnv({ env: complete, vercelEnv: "preview" }).warnings).toEqual([]);
    // Off by default: nothing to warn about.
    expect(checkServerEnv({ env: completeEnv(), vercelEnv: "preview" }).warnings).toEqual([]);
  });

  it("warns, by name only, when Slack DM is switched on without what it needs (#207)", () => {
    const env = { ...completeEnv(), LANE_SLACK_DELIVERY: "1", SLACK_CLIENT_ID: SENTINEL };
    const warnings = checkServerEnv({ env, vercelEnv: "preview" }).warnings;
    expect(warnings).toHaveLength(1);
    for (const name of ["SLACK_CLIENT_SECRET", "LANE_SLACK_TOKEN_KEY"]) expect(warnings[0]).toContain(name);
    expect(warnings[0]).not.toContain("SLACK_CLIENT_ID");
    expect(warnings.join(" ")).not.toContain(SENTINEL);
    const complete = { ...env, SLACK_CLIENT_SECRET: SENTINEL, LANE_SLACK_TOKEN_KEY: SENTINEL };
    expect(checkServerEnv({ env: complete, vercelEnv: "preview" }).warnings).toEqual([]);
  });

  it("warns, by name only, when billing is enforced without a way to pay (#214)", () => {
    const env = { ...completeEnv(), LANE_BILLING_ENFORCED: "1", STRIPE_SECRET_KEY: SENTINEL };
    const warnings = checkServerEnv({ env, vercelEnv: "preview" }).warnings;
    expect(warnings).toHaveLength(1);
    for (const name of ["STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_YEARLY", "STRIPE_PRICE_MONTHLY", "STRIPE_FOUNDING_COUPON"]) expect(warnings[0]).toContain(name);
    expect(warnings[0]).not.toContain("STRIPE_SECRET_KEY");
    expect(warnings.join(" ")).not.toContain(SENTINEL);
    const complete = { ...env, STRIPE_WEBHOOK_SECRET: SENTINEL, STRIPE_PRICE_YEARLY: SENTINEL, STRIPE_PRICE_MONTHLY: SENTINEL, STRIPE_FOUNDING_COUPON: SENTINEL };
    expect(checkServerEnv({ env: complete, vercelEnv: "preview" }).warnings).toEqual([]);
  });

  it("warns, by the missing name only, when one auth-email name is set without the other (#358)", () => {
    const onlyFrom = checkServerEnv({ env: { ...completeEnv(), LANE_AUTH_EMAIL_FROM: SENTINEL }, vercelEnv: "production" })
    expect(onlyFrom.ok).toBe(true)
    expect(onlyFrom.warnings).toHaveLength(1)
    expect(onlyFrom.warnings[0]).toContain("RESEND_API_KEY")
    expect(onlyFrom.warnings[0]).not.toContain("LANE_AUTH_EMAIL_FROM")

    const onlyKey = checkServerEnv({ env: { ...completeEnv(), RESEND_API_KEY: SENTINEL }, vercelEnv: "production" })
    expect(onlyKey.ok).toBe(true)
    expect(onlyKey.warnings).toHaveLength(1)
    expect(onlyKey.warnings[0]).toContain("LANE_AUTH_EMAIL_FROM")
    expect(onlyKey.warnings[0]).not.toContain("RESEND_API_KEY")
    expect([...onlyFrom.warnings, ...onlyKey.warnings].join(" ")).not.toContain(SENTINEL)

    // Both or neither: nothing to say, and neither name is required.
    expect(checkServerEnv({ env: { ...completeEnv(), RESEND_API_KEY: SENTINEL, LANE_AUTH_EMAIL_FROM: SENTINEL }, vercelEnv: "production" })).toEqual({ ok: true, missing: [], warnings: [] })
    expect(checkServerEnv({ env: completeEnv(), vercelEnv: "production" })).toEqual({ ok: true, missing: [], warnings: [] })
  });

  it("warns, by the missing names only, when the Better Auth secret is set without the other auth names (#371, #377)", () => {
    const others = ["BETTER_AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"];
    for (const missing of others) {
      const env: Record<string, string> = { ...completeEnv(), BETTER_AUTH_SECRET: SENTINEL };
      for (const name of others) if (name !== missing) env[name] = `${SENTINEL}_${name}`;
      const check = checkServerEnv({ env, vercelEnv: "production" });
      expect(check.ok).toBe(true);
      expect(check.warnings).toHaveLength(1);
      expect(check.warnings[0]).toContain(missing);
      for (const name of others.filter((name) => name !== missing)) expect(check.warnings[0]).not.toContain(name);
      expect(check.warnings[0]).not.toContain(SENTINEL);
    }

    const onlySecret = checkServerEnv({ env: { ...completeEnv(), BETTER_AUTH_SECRET: SENTINEL, GOOGLE_CLIENT_ID: " " }, vercelEnv: "preview" });
    expect(onlySecret.warnings).toHaveLength(1);
    for (const name of others) expect(onlySecret.warnings[0]).toContain(name);
    expect(onlySecret.warnings[0]).not.toContain(SENTINEL);

    // All six, or no secret: nothing to say, and none is required. The site key alone is never required either (#377).
    const allSix = { ...completeEnv(), BETTER_AUTH_SECRET: SENTINEL, ...Object.fromEntries(others.map((name) => [name, SENTINEL])) };
    expect(checkServerEnv({ env: allSix, vercelEnv: "production" })).toEqual({ ok: true, missing: [], warnings: [] });
    const noSecret = { ...completeEnv(), GOOGLE_CLIENT_ID: SENTINEL };
    expect(checkServerEnv({ env: noSecret, vercelEnv: "production" })).toEqual({ ok: true, missing: [], warnings: [] });
    expect(checkServerEnv({ env: { ...noSecret, BETTER_AUTH_SECRET: "  " }, vercelEnv: "production" })).toEqual({ ok: true, missing: [], warnings: [] });
  });

  it("reads VERCEL_ENV from the env when not given explicitly", () => {
    const env = completeEnv();
    env.VERCEL_ENV = "production";
    delete env.KV_REST_API_URL;

    expect(checkServerEnv({ env }).missing).toEqual(["KV_REST_API_URL"]);
  });
});

describe("assertServerEnv", () => {
  it("throws with the missing names and never a value", () => {
    const env = completeEnv();
    delete env.ANTHROPIC_API_KEY;

    let caught: unknown;
    try {
      assertServerEnv({ env, vercelEnv: "production" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingEnvError);
    const error = caught as MissingEnvError;
    expect(error.missing).toEqual(["ANTHROPIC_API_KEY"]);
    expect(error.message).toContain("ANTHROPIC_API_KEY");
    expect(error.message).not.toContain(SENTINEL);
  });

  it("returns the check when everything is present", () => {
    expect(assertServerEnv({ env: completeEnv(), vercelEnv: "production" }).ok).toBe(true);
  });
});

describe("reportServerEnv", () => {
  it("is strict when NODE_ENV is production", () => {
    const env = completeEnv();
    delete env.NEXT_PUBLIC_APP_URL;
    const log = { warn: vi.fn() };

    expect(() =>
      reportServerEnv({ env, nodeEnv: "production", vercelEnv: "production", log }),
    ).toThrow(MissingEnvError);
  });

  it("warns once with the names outside production and does not throw", () => {
    const env = completeEnv();
    delete env.SUPABASE_SECRET_KEY;
    delete env.KV_REST_API_URL;
    const log = { warn: vi.fn() };

    const check = reportServerEnv({ env, nodeEnv: "development", vercelEnv: undefined, log });

    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(["SUPABASE_SECRET_KEY"]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][0]).toContain("SUPABASE_SECRET_KEY");
  });

  it("stays quiet when everything is present", () => {
    const log = { warn: vi.fn() };
    reportServerEnv({ env: completeEnv(), nodeEnv: "development", vercelEnv: "production", log });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("never logs a value, only names", () => {
    const env = completeEnv();
    delete env.CLERK_JWT_KEY;
    delete env.TRIAGE_TOKEN_SECRET;
    const log = { warn: vi.fn() };

    reportServerEnv({ env, nodeEnv: "development", vercelEnv: "production", log });

    expect(log.warn).toHaveBeenCalled();
    for (const call of log.warn.mock.calls) {
      const line = call.map(String).join(" ");
      expect(line).not.toContain(SENTINEL);
    }
  });
});
