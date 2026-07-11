import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult = { allowed: boolean; retryAfterMs: number };

const MISSING_ENV =
  !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;

if (MISSING_ENV && process.env.NODE_ENV === "production") {
  console.warn(
    "[rate-limit] KV_REST_API_URL / KV_REST_API_TOKEN not set — rate limiting disabled"
  );
}

const ratelimit = MISSING_ENV
  ? null
  : new Ratelimit({
      redis: new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      }),
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      prefix: "lane:ratelimit:ai",
    });

export async function checkAiRateLimit(
  userId: string
): Promise<RateLimitResult> {
  if (!ratelimit) {
    return { allowed: true, retryAfterMs: 0 };
  }

  try {
    const result = await ratelimit.limit(userId);
    if (result.success) {
      return { allowed: true, retryAfterMs: 0 };
    }
    return {
      allowed: false,
      retryAfterMs: Math.max(0, result.reset - Date.now()),
    };
  } catch (err) {
    console.error("[rate-limit] Redis error — failing open:", err);
    return { allowed: true, retryAfterMs: 0 };
  }
}
