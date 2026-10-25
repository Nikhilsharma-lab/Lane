/**
 * Spec #195 item 2 (#204): the one Inbox read model. It decides what a person's Inbox holds, given the
 * workspace's records and the person (their id and role). Pure: no I/O and no clock, so the page, the bell's
 * count and the tests share it.
 *
 * For-your-information items come from the stored notifications with their read state: picked up, Done,
 * comments, Looks good and invite accepted. A read item has cleared and is not in the Inbox. A Guest gets only
 * items about their own submissions. Needs-you items (#205) are worked out from Request state and join this
 * model; review asks, Concerns, resets and the stored reminders are not For your information.
 */

/** The stored notification kinds that are For your information. The loader narrows its read to these. */
export const FOR_YOUR_INFORMATION_KINDS = ["request_picked_up", "request_done", "comment_added", "review_looks_good", "invite_accepted"] as const
export type ForYourInformationKind = (typeof FOR_YOUR_INFORMATION_KINDS)[number]

export type InboxViewer = { userId: string; role: "admin" | "member" | "guest" }

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

export type Inbox = { forYourInformation: ForYourInformationItem[] }
export type InboxRecords = { notifications: readonly StoredNotification[] }

const FYI = new Set<string>(FOR_YOUR_INFORMATION_KINDS)

export const isForYourInformation = (type: string): type is ForYourInformationKind => FYI.has(type)

/** A Guest follows only their own submissions; everyone else, anything addressed to them. */
function visibleTo(viewer: InboxViewer, row: StoredNotification) {
  if (viewer.role !== "guest") return true
  return row.requestId !== null && row.requestCreatedBy === viewer.userId
}

export function buildInbox(viewer: InboxViewer, records: InboxRecords): Inbox {
  const forYourInformation = records.notifications
    .filter(row => row.userId === viewer.userId && row.readAt === null && isForYourInformation(row.type) && visibleTo(viewer, row))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row): ForYourInformationItem => ({
      id: row.id, type: row.type, requestId: row.requestId, readAt: row.readAt, createdAt: row.createdAt, actorName: row.actorName,
      requestTitle: row.requestTitle, requestNumber: row.requestNumber, reframedProblem: row.reframedProblem, detail: row.detail,
    }))
  return { forYourInformation }
}
