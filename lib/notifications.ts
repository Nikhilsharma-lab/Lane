import { notifications } from "@/db/schema";
import { assignments } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { UserDb } from "@/db/user";

type NotificationType =
  | "assigned"
  | "unassigned"
  | "comment"
  | "mention"
  | "stage_change"
  | "signoff_requested"
  | "signoff_submitted"
  | "request_approved"
  | "request_rejected"
  | "figma_update"
  | "idea_vote"
  | "idea_approved"
  | "nudge"
  | "project_update"
  | "weekly_digest";

interface NotificationParams {
  orgId: string;
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  requestId?: string | null;
  title: string;
  body?: string | null;
  url: string;
}

/**
 * Insert a single notification. Never throws — notification failures
 * must not break the main action.
 * Skips if recipientId === actorId (don't notify yourself).
 */
export async function createNotification(
  db: UserDb,
  params: NotificationParams
): Promise<void> {
  try {
    if (params.actorId && params.recipientId === params.actorId) return;

    await db.insert(notifications).values({
      orgId: params.orgId,
      recipientId: params.recipientId,
      actorId: params.actorId,
      type: params.type,
      requestId: params.requestId ?? null,
      title: params.title,
      body: params.body ?? null,
      url: params.url,
    });
  } catch {
    // Silent — notification insert must never break the main action
  }
}

/**
 * Fan-out: create one notification per recipient.
 * Automatically filters out the actor (don't notify yourself).
 */
export async function notifyMany(
  db: UserDb,
  params: {
    orgId: string;
    recipientIds: string[];
    actorId: string | null;
    type: NotificationType;
    requestId?: string | null;
    title: string;
    body?: string | null;
    url: string;
  }
): Promise<void> {
  const unique = [...new Set(params.recipientIds)];
  for (const recipientId of unique) {
    await createNotification(db, { ...params, recipientId });
  }
}

/**
 * Get all people who should be notified about a request event:
 * the requester + all assignees, deduplicated.
 */
export async function getRequestRecipients(
  db: UserDb,
  requestId: string,
  requesterId?: string | null
): Promise<string[]> {
  try {
    const rows = await db
      .select({ assigneeId: assignments.assigneeId })
      .from(assignments)
      .where(eq(assignments.requestId, requestId));

    const ids = rows.map((r) => r.assigneeId);
    if (requesterId) ids.push(requesterId);
    return [...new Set(ids)];
  } catch {
    return requesterId ? [requesterId] : [];
  }
}
