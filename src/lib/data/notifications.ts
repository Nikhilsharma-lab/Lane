import "server-only";

import { and, count, eq, exists, isNull, or } from "drizzle-orm";

import { db, notifications, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";

/**
 * The same visibility rule as src/app/(app)/notifications/actions.ts. That
 * file is a "use server" module, which may only export async functions, so
 * the predicate is repeated here; src/lib/data/loaders.test.ts checks that the
 * loader and getUnreadCount agree on the same fixtures.
 */
function notificationVisibility(auth: MemberAuth) {
  const visibleRequest = exists(
    db
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.id, notifications.requestId),
          eq(requests.orgId, auth.orgId),
          auth.role === "guest" ? eq(requests.createdBy, auth.userId) : undefined
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
 * from the client after hydration. One statement.
 */
export async function loadUnreadCount(auth: MemberAuth): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(notificationVisibility(auth), isNull(notifications.readAt)));

  return row?.value ?? 0;
}
