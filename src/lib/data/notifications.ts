import "server-only";
import { seeable } from "@/lib/request-access"

import { and, count, eq, exists, inArray, isNull, or } from "drizzle-orm";

import { db, notifications, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { FOR_YOUR_INFORMATION_KINDS } from "@/lib/inbox-read-model";

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
 * #204: the unread For-your-information items, which the Inbox page shows beside its heading. One statement.
 * The bell counts Needs-you items instead (`countNeedsYou` in ./inbox, #205).
 */
export async function countInboxUnread(auth: MemberAuth): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(notificationVisibility(auth), isNull(notifications.readAt), inArray(notifications.type, [...FOR_YOUR_INFORMATION_KINDS])));

  return row?.value ?? 0;
}
