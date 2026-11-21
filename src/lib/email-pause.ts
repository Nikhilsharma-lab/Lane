import "server-only";
import { Redis } from "@upstash/redis";

// Auth email and Inbox email share one Resend quota. Once Resend refuses a send,
// Inbox email stops until the next 00:00 UTC so it can't use up the sends a code
// or an invitation needs (#333 Q7). Auth email keeps trying whatever this says.
export interface EmailPause {
  pause(now: Date): Promise<void>;
  isPaused(now: Date): Promise<boolean>;
}

const KEY = "lane:inbox-email:paused";

let redis: Redis | undefined;

function nextUtcMidnight(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

// Undefined when the KV env is missing. Construction can throw on malformed
// configuration, so callers keep it inside their own try.
function client(): Redis | undefined {
  if (!redis) {
    const url = process.env.KV_REST_API_URL?.trim();
    const token = process.env.KV_REST_API_TOKEN?.trim();
    if (!url || !token) return undefined;
    redis = new Redis({ url, token });
  }
  return redis;
}

// One expiring key in the AI rate limit's Upstash store; its expiry is the pause's end.
export const emailPause: EmailPause = {
  // Never throws: a failed write must not change the caller's result.
  async pause(now: Date): Promise<void> {
    try {
      const kv = client();
      if (!kv) {
        console.error("[email-pause] KV_REST_API_URL / KV_REST_API_TOKEN missing — Inbox email pause not recorded");
        return;
      }
      await kv.set(KEY, "1", { pxat: nextUtcMidnight(now) });
      console.info("[email-pause] Inbox email is paused for the rest of the UTC day");
    } catch {
      console.error("[email-pause] Write failed — Inbox email pause not recorded");
    }
  },
  // The key expires at the pause's end, so the store alone answers. An unreadable
  // pause answers paused: Inbox email holds rather than risk auth email's sends.
  async isPaused(): Promise<boolean> {
    try {
      const kv = client();
      if (!kv) {
        console.error("[email-pause] KV_REST_API_URL / KV_REST_API_TOKEN missing — Inbox email held");
        return true;
      }
      return (await kv.exists(KEY)) > 0;
    } catch {
      console.error("[email-pause] Read failed — Inbox email held");
      return true;
    }
  },
};
