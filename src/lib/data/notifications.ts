import "server-only";
import { seeable } from "@/lib/request-access"

import { and, count, eq, exists, inArray, isNull, or } from "drizzle-orm";

import { db, notifications, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { FOR_YOUR_INFORMATION_KINDS } from "@/lib/inbox-read-model";
import { writeDueReminders } from "./bell-reminders";

/**
 * Shared by notification reads and mutations so a historical delivery never
 * grants access to a Request the caller can no longer see.
 */
export function notificationVisibility(auth: MemberAuth) {
  const visibleRequest = exists(
    db
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.id, notifications.requestId),
          seeable(auth)
        )
      )
  );

  return and(
    eq(notifications.userId, auth.userId),
    eq(notifications.orgId, auth.orgId),
    // Historical delivery never grants access after a role change. Guests have
    // no workspace-wide notification surface, so non-Request events stay hidden.
    auth.role === "guest"
      ? visibleRequest
      : or(isNull(notifications.requestId), visibleRequest)
  );
}

/**
 * Plan item 1.8: the unread count the (app) layout hands to the bell as a
 * promise, so it streams in behind the first paint instead of being fetched
 * from the client after hydration. #136: first writes any bell reminders the
 * member is owed today, so both the layout stream and GET /api/notifications/unread
 * count them. A failed reminder write is logged and never blocks the count.
 * #204: the count is the Inbox's unread For-your-information items, so the badge and the page agree
 * (#205 makes it count Needs-you items instead).
 */
export async function loadUnreadCount(auth: MemberAuth): Promise<number> {
  await writeDueReminders(auth).catch((error) => {
    console.error("[notifications] reminder write failed", { kind: error instanceof Error ? error.name : "UnknownError" });
  });
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(notificationVisibility(auth), isNull(notifications.readAt), inArray(notifications.type, [...FOR_YOUR_INFORMATION_KINDS])));

  return row?.value ?? 0;
}
