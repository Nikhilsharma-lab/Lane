import "server-only";
import { upstashRedis } from "./upstash";

// Auth email and Inbox email share one Resend quota. Once Resend refuses a send,
// Inbox email stops until the next 00:00 UTC so it can't use up the sends a code
// or an invitation needs (#333 Q7). Auth email keeps trying whatever this says.
export interface EmailPause {
  pause(now: Date): Promise<void>;
  isPaused(now: Date): Promise<boolean>;
}

const KEY = "lane:inbox-email:paused";

function nextUtcMidnight(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

// The shared KV client, or undefined (logged once) while the KV env is missing.
// Construction can throw, so callers keep it inside their own try.
const client = (consequence: string) => upstashRedis({ tag: "email-pause", consequence });

// One expiring key in the AI rate limit's Upstash store; its expiry is the pause's end.
export const emailPause: EmailPause = {
  // Never throws: a failed write must not change the caller's result.
  async pause(now: Date): Promise<void> {
    try {
      const kv = client("Inbox email pause not recorded");
      if (!kv) return;
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
      const kv = client("Inbox email held");
      if (!kv) return true;
      return (await kv.exists(KEY)) > 0;
    } catch {
      console.error("[email-pause] Read failed — Inbox email held");
      return true;
    }
  },
};

// For tests of the senders that use the pause: the same shape, held in memory.
export function createInMemoryEmailPause(): EmailPause {
  let endsAt = 0;
  return {
    async pause(now) {
      endsAt = nextUtcMidnight(now);
    },
    async isPaused(now) {
      return now.getTime() < endsAt;
    },
  };
}
