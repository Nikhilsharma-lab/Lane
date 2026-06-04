/**
 * Simple in-memory rate limiter for MVP.
 * No Upstash dependency — works everywhere, resets on deploy/restart.
 * Good enough until there's a paying customer; swap to Upstash later.
 */

const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  opts: { maxRequests: number; windowMs: number }
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= opts.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/** 10 AI triage calls per minute per user */
export function checkAiRateLimit(userId: string) {
  return checkRateLimit(`ai:${userId}`, {
    maxRequests: 10,
    windowMs: 60_000,
  });
}
