import "server-only";
import { seeable } from "@/lib/request-access"

import { and, count, desc, eq, exists, isNull, or } from "drizzle-orm";

import { db, notifications, profiles, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";

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
 * from the client after hydration. One statement.
 */
export async function loadUnreadCount(auth: MemberAuth): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(notificationVisibility(auth), isNull(notifications.readAt)));

  return row?.value ?? 0;
}

const NOTIFICATIONS_LIMIT = 30;

export type NotificationRow = {
  id: string;
  type: string;
  requestId: string | null;
  /** Null for a reminder, which Lane writes itself. */
  actorId: string | null;
  readAt: Date | null;
  createdAt: Date;
  actorName: string | null;
  requestTitle: string | null;
  /** Null for an invite (no Request); 0 before allocation, which the row copy renders as "Request" (plan item 2.7). */
  requestNumber: number | null;
  reframedProblem: string | null;
  /** A reviewer's question, or the reason for a concern. */
  detail: string | null;
};

/**
 * The notification list for the bell. src/app/api/read-routes.test.ts covers its org and
 * guest scoping through GET /api/notifications. Plan item 2.7: the row reads
 * "LAN-12 · reframed problem", so the join it already has gives the code and the problem.
 */
export async function loadNotifications(auth: MemberAuth): Promise<NotificationRow[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      requestId: notifications.requestId,
      actorId: notifications.actorId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: profiles.fullName,
      requestTitle: requests.title,
      requestNumber: requests.requestNumber,
      reframedProblem: requests.reframedProblem,
      detail: notifications.detail,
    })
    .from(notifications)
    .leftJoin(profiles, eq(notifications.actorId, profiles.id))
    .leftJoin(requests, eq(notifications.requestId, requests.id))
    .where(notificationVisibility(auth))
    .orderBy(desc(notifications.createdAt))
    .limit(NOTIFICATIONS_LIMIT);
}
