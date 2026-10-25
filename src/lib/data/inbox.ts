import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db, notifications, profiles, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { buildInbox, FOR_YOUR_INFORMATION_KINDS, type Inbox } from "@/lib/inbox-read-model";
import { notificationVisibility } from "./notifications";

/** The newest unread items the page shows; Mark all read still clears every one. */
export const INBOX_LIMIT = 100;

/**
 * #204: a person's Inbox in this workspace. One read of their unread For-your-information notifications
 * (the read model's kinds; a read item has cleared), scoped like every notification read so a historical
 * delivery never grants access to a Request they can no longer see. The read model decides the rest.
 */
export async function loadInbox(auth: MemberAuth): Promise<Inbox> {
  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      requestId: notifications.requestId,
      requestCreatedBy: requests.createdBy,
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
    .where(and(notificationVisibility(auth), isNull(notifications.readAt), inArray(notifications.type, [...FOR_YOUR_INFORMATION_KINDS])))
    .orderBy(desc(notifications.createdAt))
    .limit(INBOX_LIMIT);

  return buildInbox({ userId: auth.userId, role: auth.role }, { notifications: rows });
}
