import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult =
  | { allowed: true; retryAfterMs: 0 }
  | { allowed: false; reason: "rate_limited" | "unavailable"; retryAfterMs: number };

let ratelimit: Ratelimit | undefined;
const unavailable: RateLimitResult = { allowed: false, reason: "unavailable", retryAfterMs: 0 };

export async function checkAiRateLimit(
  userId: string
): Promise<RateLimitResult> {
  try {
    if (!ratelimit) {
      const url = process.env.KV_REST_API_URL?.trim();
      const token = process.env.KV_REST_API_TOKEN?.trim();
      if (!url || !token) {
        console.error("[rate-limit] KV_REST_API_URL / KV_REST_API_TOKEN missing — AI review unavailable");
        return unavailable;
      }
      // Initialization can reject malformed configuration too. Keep that failure
      // inside the same closed, recoverable boundary as a Redis request failure.
      ratelimit = new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(10, "60 s"),
        prefix: "lane:ratelimit:ai",
      });
    }
    const result = await ratelimit.limit(userId);
    // Upstash deliberately returns success: true when its check times out.
    // That response is not authorization to spend an AI call.
    if (result.reason === "timeout") return unavailable;
    if (result.success) {
      return { allowed: true, retryAfterMs: 0 };
    }
    return {
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: Math.max(0, result.reset - Date.now()),
    };
  } catch {
    console.error("[rate-limit] Check failed — AI review unavailable");
    return unavailable;
  }
}
