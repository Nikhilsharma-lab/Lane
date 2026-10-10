"use server";

import { db, notifications, profiles, requests } from "@/db";
import { eq, and, or, isNull, desc, count, exists } from "drizzle-orm";
import { requireActiveMember, type MemberAuth } from "@/lib/auth-guard";

const NOTIFICATIONS_LIMIT = 30;

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

export async function getNotifications(context: { orgId: string }) {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "Not found" };

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      requestId: notifications.requestId,
      actorId: notifications.actorId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: profiles.fullName,
      requestTitle: requests.title,
    })
    .from(notifications)
    .leftJoin(profiles, eq(notifications.actorId, profiles.id))
    .leftJoin(requests, eq(notifications.requestId, requests.id))
    .where(notificationVisibility(auth))
    .orderBy(desc(notifications.createdAt))
    .limit(NOTIFICATIONS_LIMIT);

  return { success: true, notifications: rows };
}

export async function getUnreadCount(context: { orgId: string }) {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "Not found" };

  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        notificationVisibility(auth),
        isNull(notifications.readAt)
      )
    );

  return { success: true, count: row?.value ?? 0 };
}

export async function markNotificationRead(
  notificationId: string,
  context: { orgId: string }
) {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "Not found" };

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        notificationVisibility(auth)
      )
    );

  return { success: true };
}

export async function markAllNotificationsRead(context: { orgId: string }) {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "Not found" };

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        notificationVisibility(auth),
        isNull(notifications.readAt)
      )
    );

  return { success: true };
}

export async function markNotificationUnread(
  notificationId: string,
  context: { orgId: string }
) {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "Not found" };

  await db
    .update(notifications)
    .set({ readAt: null })
    .where(
      and(
        eq(notifications.id, notificationId),
        notificationVisibility(auth)
      )
    );

  return { success: true };
}
