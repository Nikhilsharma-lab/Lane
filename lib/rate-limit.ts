import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * Resolves whether rate limiting should be active based on environment config.
 *
 * Fails closed in production: if Upstash is not configured, throws rather
 * than silently skipping rate limits — a production deploy without rate
 * limiting is how AI-cost runaway happens. Dev and test warn and skip
 * (consistent with selectUserSessionDatabaseUrl in db/user.ts).
 */
export function selectRateLimiterConfig(env: {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  NODE_ENV?: string;
}):
  | { enabled: true; url: string; token: string }
  | { enabled: false } {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;
  if (url && token) return { enabled: true, url, token };

  if (env.NODE_ENV === "production") {
    throw new Error(
      "[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are " +
        "required in production. Rate limiting protects AI routes from " +
        "cost runaway; silently skipping it is not acceptable in prod."
    );
  }

  console.warn(
    "[rate-limit] Upstash not configured — rate limiting is DISABLED. " +
      "OK for local dev; production will throw."
  );
  return { enabled: false };
}

// Lazy init: selectRateLimiterConfig throws in production if env vars are
// missing, which would break the Next.js build (NODE_ENV=production during
// `next build`). Deferring until first use means the throw fires on the
// first real request in prod, not at build time in CI.
let _aiLimiter: Ratelimit | null = null;
let _generalLimiter: Ratelimit | null = null;
let _initialized = false;

function ensureLimiters(): void {
  if (_initialized) return;
  // selectRateLimiterConfig can throw in production if env vars are missing.
  // Mark _initialized only AFTER it returns — otherwise a warm serverless
  // instance would throw on the first request (correct), then early-return
  // on every subsequent request with _aiLimiter still null, silently
  // skipping rate limits. That recreates the exact fail-open we're fixing.
  const config = selectRateLimiterConfig(process.env);
  _initialized = true;
  if (!config.enabled) return;
  const redis = new Redis({ url: config.url, token: config.token });
  _aiLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "lane:ai",
  });
  _generalLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "lane:api",
  });
}

export async function checkAiRateLimit(
  userId: string,
): Promise<NextResponse | null> {
  ensureLimiters();
  if (!_aiLimiter) return null; // Dev/test only — production throws in ensureLimiters above

  const { success, limit, remaining, reset } = await _aiLimiter.limit(userId);

  if (!success) {
    return NextResponse.json(
      { error: "Too many AI requests. Please try again in a minute." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
          "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
        },
      },
    );
  }

  return null;
}

export async function checkGeneralRateLimit(
  userId: string,
): Promise<NextResponse | null> {
  ensureLimiters();
  if (!_generalLimiter) return null;

  const { success, limit, remaining, reset } =
    await _generalLimiter.limit(userId);

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
          "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
        },
      },
    );
  }

  return null;
}
