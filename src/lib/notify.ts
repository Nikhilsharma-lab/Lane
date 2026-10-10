import { db, notifications } from "@/db";
import type { NewNotification } from "@/db";

/** Inserts the notifications a comment produces, skipping self-notifications.
 *
 * Lifecycle notifications (request_picked_up, request_done) are not written
 * here: pickUpRequest and markDone insert them inside their one-statement CTE,
 * so the status change and its notification commit or fail together (plan
 * item 1.4, decision 8.17). A failed insert there fails the mutation instead
 * of being logged and dropped. */
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
