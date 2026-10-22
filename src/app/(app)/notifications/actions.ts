"use server";

import { db, notifications } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireActiveMember, refusal } from "@/lib/auth-guard";
import { notificationVisibility } from "@/lib/data/notifications";

export async function markNotificationRead(
  notificationId: string,
  context: { orgId: string }
) {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("Not found") };

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
  if (!auth) return { error: await refusal("Not found") };

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
  if (!auth) return { error: await refusal("Not found") };

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
