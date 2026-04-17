import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";

/**
 * Track an analytics event.
 *
 * Writes to the analytics_events table. Events are not yet wired across the
 * app — a single instrumentation pass (parking lot item, 2026-04-16) will
 * connect them after feature-complete.
 *
 * Fire-and-forget: errors are logged, never thrown. Analytics must not break
 * user flows.
 *
 * Uses the system-role `db` intentionally — analytics writes should always
 * succeed regardless of RLS policy state. This is one of the legitimate
 * system-role uses called out in docs/rls-audit.md.
 */
export async function track(
  eventName: string,
  properties: Record<string, unknown> = {},
  context?: {
    userId?: string;
    workspaceId?: string;
  }
): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      eventName,
      properties,
      userId: context?.userId ?? null,
      workspaceId: context?.workspaceId ?? null,
    });
  } catch (err) {
    console.error(`[analytics] Failed to track "${eventName}":`, err);
  }
}
