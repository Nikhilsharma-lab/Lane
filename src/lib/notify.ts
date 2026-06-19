import { db, notifications } from "@/db";
import type { NewNotification } from "@/db";

export async function createNotification(
  data: Omit<NewNotification, "id" | "createdAt" | "readAt">
): Promise<void> {
  if (data.userId === data.actorId) return;
  try {
    await db.insert(notifications).values(data);
  } catch (err) {
    console.error("[notify] failed to create notification", { type: data.type, userId: data.userId, err });
  }
}

export async function createNotifications(
  rows: Omit<NewNotification, "id" | "createdAt" | "readAt">[]
): Promise<void> {
  const filtered = rows.filter((r) => r.userId !== r.actorId);
  if (filtered.length === 0) return;
  try {
    await db.insert(notifications).values(filtered);
  } catch (err) {
    console.error("[notify] failed to create notifications", { types: filtered.map((r) => r.type), userIds: filtered.map((r) => r.userId), err });
  }
}
