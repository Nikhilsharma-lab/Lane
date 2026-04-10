import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Gracefully degrade if Redis is not configured
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// AI routes: 10 requests per minute per user
const aiLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "lane:ai",
    })
  : null;

// General API routes: 60 requests per minute per user
const generalLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "lane:api",
    })
  : null;

export async function checkAiRateLimit(
  userId: string,
): Promise<NextResponse | null> {
  if (!aiLimiter) return null; // No Redis configured — skip rate limiting

  const { success, limit, remaining, reset } = await aiLimiter.limit(userId);

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
  if (!generalLimiter) return null;

  const { success, limit, remaining, reset } =
    await generalLimiter.limit(userId);

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
