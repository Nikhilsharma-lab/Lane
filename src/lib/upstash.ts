import "server-only";
import { Redis } from "@upstash/redis";

let redis: Redis | undefined;

// The one Upstash KV client the AI rate limit and the Inbox email pause share,
// made on first use. Undefined, with one log line naming who is affected, while
// the KV env is missing. Construction can throw on malformed configuration, so
// callers keep it inside their own try.
export function upstashRedis(log: { tag: string; consequence: string }): Redis | undefined {
  if (!redis) {
    const url = process.env.KV_REST_API_URL?.trim();
    const token = process.env.KV_REST_API_TOKEN?.trim();
    if (!url || !token) {
      console.error(`[${log.tag}] KV_REST_API_URL / KV_REST_API_TOKEN missing — ${log.consequence}`);
      return undefined;
    }
    redis = new Redis({ url, token });
  }
  return redis;
}
