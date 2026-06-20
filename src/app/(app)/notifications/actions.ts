"use server";

import { db, notifications, profiles, requests } from "@/db";
import { eq, and, isNull, desc, count } from "drizzle-orm";
import { requireActiveMember } from "@/lib/auth-guard";

const NOTIFICATIONS_LIMIT = 30;

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
    .where(
      and(
        eq(notifications.userId, auth.userId),
        eq(notifications.orgId, auth.orgId)
      )
    )
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
        eq(notifications.userId, auth.userId),
        eq(notifications.orgId, auth.orgId),
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
        eq(notifications.userId, auth.userId),
        eq(notifications.orgId, auth.orgId)
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
        eq(notifications.userId, auth.userId),
        eq(notifications.orgId, auth.orgId),
        isNull(notifications.readAt)
      )
    );

  return { success: true };
}
