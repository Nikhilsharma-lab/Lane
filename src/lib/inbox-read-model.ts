/**
 * Spec #195 item 2 (#204, #205): the one Inbox read model. It decides what a person's Inbox holds, given the
 * workspace's records, the person (their id and role) and the current time. Pure: no I/O and no clock, so the
 * page, the bell's count and the tests share it.
 *
 * Needs-you items (#205) are worked out from Request state each time, never stored, so they clear themselves
 * the moment the thing is done and never repeat:
 * - a review waiting on you, while the Request is Open and you haven't answered;
 * - an open Concern on your Request, while it is Open (an edit resets the answer, so it clears too);
 * - one "Record the release" 3 days after Done, until the Release is recorded;
 * - one Result due on the measurement due date, until the Request is Closed.
 * "Your Request" means you are its current Requester, so a handover moves the items to the new one.
 * Only Admins and Members get Needs-you items: a Guest follows their own submissions, and anyone else (a
 * future Viewer included) is never asked to act.
 *
 * For-your-information items come from the stored notifications with their read state: picked up, Done,
 * comments, Looks good and invite accepted. A read item has cleared and is not in the Inbox. A Guest gets only
 * items about their own submissions.
 */
import type { WorkspacePermission } from "./auth-guard"
import { journeyStatus, requesterOf, type JourneyFacts } from "./request-journey"
import { canChangeThings, readsWholeWorkspace } from "./role-rules"
import type { Reviewer } from "./request-reviewer-rules"
import { DAY_MS, daysUntil } from "./utc-day"

/** The stored notification kinds that are For your information. The loader narrows its read to these. */
export const FOR_YOUR_INFORMATION_KINDS = ["request_picked_up", "request_done", "comment_added", "review_looks_good", "invite_accepted"] as const
export type ForYourInformationKind = (typeof FOR_YOUR_INFORMATION_KINDS)[number]

/** The stored notification kinds that date a review ask: the ask itself, and the reset an edit sends. */
export const REVIEW_ASK_KINDS = ["review_requested", "review_reset"] as const

export type InboxViewer = { userId: string; role: WorkspacePermission }

/** One stored notification as the loader reads it, with the Request's author for the Guest rule. */
export type StoredNotification = {
  id: string
  /** The recipient. */
  userId: string
  type: string
  requestId: string | null
  /** Who submitted the Request (null for an invite, which has none). */
  requestCreatedBy: string | null
  readAt: Date | null
  createdAt: Date
  actorName: string | null
  requestTitle: string | null
  /** 0 before allocation, which the row copy renders as "Request". */
  requestNumber: number | null
  reframedProblem: string | null
  /** A reviewer's question, or the reason for a concern. */
  detail: string | null
}

/** A For-your-information item: what its row says, and the Request it opens. */
export type ForYourInformationItem = Omit<StoredNotification, "userId" | "requestCreatedBy">

/** A Request as the Needs-you rules read it: its journey facts, Requester, Reviewers and when work reached Done. */
export type InboxRequest = JourneyFacts & {
  id: string
  requestNumber: number | null
  title: string | null
  reframedProblem: string | null
  createdBy: string
  /** The Member who took a Guest submission on (#212); the Requester unless it was handed over since. */
  takenOnBy: string | null
  createdAt: Date
  /** When the work was last marked Done (null unless Done). */
  doneAt: Date | null
  reviewers: readonly Reviewer[]
  /** When the latest review ask (or the reset an edit sent) reached the viewer; null when none was recorded. */
  reviewAskedAt: Date | null
}

export type NeedsYouKind = "review" | "concern" | "record_release" | "result_due"

export type NeedsYouItem = {
  /**
   * One per occurrence, stable while it stays open: the same item on every read until it clears. A new ask, a
   * new Concern, a new Done or a new due date is a new key. Delivery (#206) sends each key at most once.
   */
  key: string
  kind: NeedsYouKind
  requestId: string
  requestNumber: number | null
  requestTitle: string | null
  reframedProblem: string | null
  /** When it began needing the person. */
  since: Date
  /** The Reviewer who raised a Concern (the name they were picked by); null for the other kinds. */
  reviewerName: string | null
  /** The review question, or the Concern's reason. */
  detail: string | null
  /** The measurement due date (UTC), for Result due. */
  dueDate: string | null
}

export type Inbox = { needsYou: NeedsYouItem[]; forYourInformation: ForYourInformationItem[] }
export type InboxRecords = { notifications: readonly StoredNotification[]; requests: readonly InboxRequest[] }

const FYI = new Set<string>(FOR_YOUR_INFORMATION_KINDS)

export const isForYourInformation = (type: string): type is ForYourInformationKind => FYI.has(type)

/** Whether the person is ever asked to act: Admins and Members only. */
export const getsNeedsYou = (viewer: Pick<InboxViewer, "role">) => canChangeThings(viewer.role)

/** A Guest follows only their own submissions; everyone else, anything addressed to them. */
function visibleTo(viewer: InboxViewer, row: StoredNotification) {
  if (readsWholeWorkspace(viewer.role)) return true
  return row.requestId !== null && row.requestCreatedBy === viewer.userId
}

/** Record the release appears this long after the work reached Done (an exact instant, not a calendar day). */
export const RECORD_RELEASE_AFTER_DAYS = 3

function needsYouOf(viewer: InboxViewer, request: InboxRequest, now: Date): NeedsYouItem[] {
  const item = (kind: NeedsYouKind, occurrence: string, since: Date, extra: Partial<Pick<NeedsYouItem, "reviewerName" | "detail" | "dueDate">> = {}): NeedsYouItem => ({
    key: `${kind}:${request.id}:${occurrence}`, kind, requestId: request.id, requestNumber: request.requestNumber, requestTitle: request.title,
    reframedProblem: request.reframedProblem, since, reviewerName: null, detail: null, dueDate: null, ...extra,
  })
  const status = journeyStatus(request).status
  const items: NeedsYouItem[] = []

  if (status === "open") {
    for (const reviewer of request.reviewers) {
      if (reviewer.nominee.kind !== "member" || reviewer.nominee.userId !== viewer.userId || reviewer.decision !== null) continue
      const since = request.reviewAskedAt ?? request.createdAt
      items.push(item("review", `${reviewer.id}:${since.toISOString()}`, since, { detail: reviewer.note.trim() || null }))
    }
    if (requesterOf(request) === viewer.userId) {
      for (const reviewer of request.reviewers) {
        if (reviewer.decision?.kind !== "concern") continue
        const { at, reason } = reviewer.decision
        items.push(item("concern", `${reviewer.id}:${at}`, new Date(at), { reviewerName: reviewer.displayNameAtSelection, detail: reason.trim() || null }))
      }
    }
  }

  if (requesterOf(request) !== viewer.userId) return items

  if (status === "done" && request.doneAt) {
    // A voided Release puts the work back at Done with no Release: the 3 days start again from the latest void.
    const lastVoid = request.releaseState?.history.findLast(event => event.input.kind === "void")?.at
    const from = lastVoid && Date.parse(lastVoid) > request.doneAt.getTime() ? new Date(lastVoid) : request.doneAt
    const since = new Date(from.getTime() + RECORD_RELEASE_AFTER_DAYS * DAY_MS)
    if (now >= since) items.push(item("record_release", from.toISOString(), since))
  }

  if (status === "measuring") {
    const { dueDate } = request.releaseState!.release!
    if (daysUntil(dueDate, now) <= 0) items.push(item("result_due", dueDate, new Date(`${dueDate}T00:00:00.000Z`), { dueDate }))
  }
  return items
}

export function buildInbox(viewer: InboxViewer, records: InboxRecords, { now }: { now: Date }): Inbox {
  const needsYou = getsNeedsYou(viewer)
    ? records.requests.flatMap(request => needsYouOf(viewer, request, now)).sort((a, b) => b.since.getTime() - a.since.getTime() || a.key.localeCompare(b.key))
    : []
  const forYourInformation = records.notifications
    .filter(row => row.userId === viewer.userId && row.readAt === null && isForYourInformation(row.type) && visibleTo(viewer, row))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row): ForYourInformationItem => ({
      id: row.id, type: row.type, requestId: row.requestId, readAt: row.readAt, createdAt: row.createdAt, actorName: row.actorName,
      requestTitle: row.requestTitle, requestNumber: row.requestNumber, reframedProblem: row.reframedProblem, detail: row.detail,
    }))
  return { needsYou, forYourInformation }
}
