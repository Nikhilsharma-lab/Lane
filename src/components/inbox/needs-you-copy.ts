/**
 * #205: what a Needs-you row says. Line 1 names the Request the way every Inbox row does ("LAN-12 · reframed
 * problem"); line 2 says what is waiting on the person. Record the release and Result due come from Lane, not a
 * person, so they never name one and carry no time (they are dated by Done and the due date). Pure, so the view
 * and the tests share it.
 */
import { notificationRow } from "@/components/shell/notification-copy"
import { journeyDate } from "@/lib/request-journey"
import type { NeedsYouInboxItem } from "./inbox-item"

export type NeedsYouRowCopy = {
  primary: string
  secondary: string
  /** The review question or the Concern's reason; null when there is none. */
  detail: string | null
  /** Whether the row shows when it began (an ask or a Concern does; Lane's own reminders don't). */
  showsTime: boolean
  /** The row button's accessible name. */
  name: string
}

function event(item: NeedsYouInboxItem): string {
  switch (item.kind) {
    case "review": return "Waiting for your review"
    case "concern": return `${item.reviewerName?.trim() || "A Reviewer"} raised a concern`
    case "record_release": return "Still Done. Record the release once it is live"
    case "result_due": return `Result due ${item.dueDate ? journeyDate(item.dueDate) : "now"}. Close it when you have the numbers`
  }
}

export function needsYouRow(item: NeedsYouInboxItem, time?: string): NeedsYouRowCopy {
  // The Request line is the For-your-information row's own, so both lists name a Request the same way.
  const { primary } = notificationRow({ type: "comment_added", actorName: null, requestTitle: item.requestTitle, requestNumber: item.requestNumber, reframedProblem: item.reframedProblem, readAt: null })
  const secondary = event(item)
  const detail = item.detail?.trim() || null
  const showsTime = item.kind === "review" || item.kind === "concern"
  const name = [primary, secondary, detail, showsTime ? time : undefined].filter(Boolean).join(", ")
  return { primary, secondary, detail, showsTime, name }
}
