import "server-only";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db, notifications, profiles, requestAgreements, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { buildInbox, FOR_YOUR_INFORMATION_KINDS, getsNeedsYou, REVIEW_ASK_KINDS, type Inbox, type InboxRequest, type NeedsYouItem } from "@/lib/inbox-read-model";
import { seeable } from "@/lib/request-access";
import { journeyStatusCondition, requesterColumn } from "@/lib/request-journey-sql";
import type { Reviewer } from "@/lib/request-reviewer-rules";
import { notificationVisibility } from "./notifications";

/** The newest unread items the page shows; Mark all read still clears every one. */
export const INBOX_LIMIT = 100;

const toDate = (value: string | Date | null) => (value === null ? null : new Date(value));

/**
 * #205: the Requests that can owe this person a Needs-you item, with what the rules read. One statement: the
 * Requests they can see that are Open, Done or Measuring, where they are the current Requester or a member
 * Reviewer, with the Reviewers and when the latest review ask (or reset) reached them. The read model decides
 * the rest at `now`. A Guest or anyone else who is never asked to act gets no read at all.
 */
async function loadNeedsYouRequests(auth: MemberAuth, only?: { requestId: string }): Promise<InboxRequest[]> {
  if (!getsNeedsYou(auth)) return [];
  const asReviewer = JSON.stringify([{ nominee: { kind: "member", userId: auth.userId } }]);
  const rows = await db
    .select({
      id: requests.id,
      requestNumber: requests.requestNumber,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      createdBy: requests.createdBy,
      takenOnBy: requests.takenOnBy,
      createdAt: requests.createdAt,
      status: requests.status,
      releaseState: requests.releaseState,
      outcomeClosure: requests.outcomeClosure,
      exceptionClosure: requests.exceptionClosure,
      doneAt: requests.doneAt,
      reviewers: requestAgreements.reviewers,
      reviewAskedAt: sql<string | Date | null>`(
        select max(asked.created_at) from ${notifications} asked
        where asked.request_id = ${requests.id} and asked.user_id = ${auth.userId} and asked.org_id = ${auth.orgId}
          and asked.type in (${sql.join(REVIEW_ASK_KINDS.map((kind) => sql`${kind}::public.notification_type`), sql`, `)})
      )`.mapWith(toDate),
    })
    .from(requests)
    .leftJoin(requestAgreements, and(eq(requestAgreements.requestId, requests.id), eq(requestAgreements.orgId, requests.orgId)))
    .where(
      and(
        seeable(auth),
        or(journeyStatusCondition("open"), journeyStatusCondition("done"), journeyStatusCondition("measuring")),
        or(eq(requesterColumn, auth.userId), sql`${requestAgreements.reviewers} @> ${asReviewer}::jsonb`),
        only && eq(requests.id, only.requestId),
      ),
    );

  return rows.map((row) => ({ ...row, reviewers: (row.reviewers ?? []) as Reviewer[], reviewAskedAt: toDate(row.reviewAskedAt) }));
}

/** #204: the person's unread For-your-information notifications (the read model's kinds; a read item has cleared). */
async function loadForYourInformation(auth: MemberAuth) {
  return db
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
}

/**
 * #204 / #205: a person's Inbox in this workspace at `now`. Needs-you items are worked out from the Requests
 * they can see; For-your-information items come from their stored notifications, scoped like every
 * notification read so a historical delivery never grants access to a Request they can no longer see.
 */
export async function loadInbox(auth: MemberAuth, now: Date = new Date()): Promise<Inbox> {
  const [requestRows, notificationRows] = await Promise.all([loadNeedsYouRequests(auth), loadForYourInformation(auth)]);
  return buildInbox({ userId: auth.userId, role: auth.role }, { notifications: notificationRows, requests: requestRows }, { now });
}

/**
 * #206: the person's Needs-you items at `now`, for delivery outside Lane: the same statement and rules as the
 * Inbox, optionally narrowed to one Request (an action that just changed it).
 */
export async function loadNeedsYou(auth: MemberAuth, now: Date, only?: { requestId: string }): Promise<NeedsYouItem[]> {
  const requestRows = await loadNeedsYouRequests(auth, only);
  return buildInbox({ userId: auth.userId, role: auth.role }, { notifications: [], requests: requestRows }, { now }).needsYou;
}

/** #205: what the bell counts, the person's Needs-you items at `now`. One statement; nothing is written. */
export async function countNeedsYou(auth: MemberAuth, now: Date = new Date()): Promise<number> {
  const requestRows = await loadNeedsYouRequests(auth);
  return buildInbox({ userId: auth.userId, role: auth.role }, { notifications: [], requests: requestRows }, { now }).needsYou.length;
}
