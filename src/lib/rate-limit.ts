import { Ratelimit } from "@upstash/ratelimit";
import { upstashRedis } from "./upstash";

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
      // Initialization can reject malformed configuration too. Keep that failure
      // inside the same closed, recoverable boundary as a Redis request failure.
      const redis = upstashRedis({ tag: "rate-limit", consequence: "AI review unavailable" });
      if (!redis) return unavailable;
      ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "60 s"),
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
