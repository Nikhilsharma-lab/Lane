/**
 * Plan item 2.7: what a notification row says. Line 1 names the Request by
 * its saved code and reframed problem ("LAN-12 · Customers cannot find the
 * delivery date before checkout"), line 2 is the event with "Done" as a
 * status, and the accessible name joins them with the local time and ends in
 * "unread" only for unread rows. The read toggle names the same Request, so each
 * row's toggle is told apart. Pure, so the view and the tests share it.
 */

import { formatRequestCode } from "@/lib/request-code"

export type NotificationCopyInput = {
  type: string
  actorName: string | null
  requestTitle: string | null
  requestNumber: number | null
  reframedProblem: string | null
  readAt: string | null
  /** A reviewer's question, or the reason for a concern. */
  detail?: string | null
}

export type NotificationRowCopy = {
  /** Line 1: the Request, or the invite sentence. */
  primary: string
  /** Line 2 without the time; null for an invite. */
  secondary: string | null
  /** The review question or concern reason; null when there is none. */
  detail: string | null
  /** The row button's accessible name. */
  name: string
  /** The read toggle's accessible name, naming the row's Request ("Mark LAN-12 read"). */
  toggle: string
}

const ACTOR_FALLBACK = "Someone"

/** The saved code, or null where formatRequestCode would throw (an unnumbered Request, column default 0). */
function requestCode(requestNumber: number | null) {
  try { return requestNumber ? formatRequestCode(requestNumber) : null } catch { return null }
}

/** The event line for a Request row; null for an invite, which has no second line. */
export function notificationEvent(type: string, actor: string): string | null {
  switch (type) {
    case "comment_added": return `${actor} commented`
    case "request_picked_up": return `${actor} picked it up`
    case "request_done": return `${actor} marked it Done`
    case "review_requested": return `${actor} asked you to review`
    case "review_looks_good": return `${actor} said it looks good`
    case "review_concern": return `${actor} raised a concern`
    case "review_reset": return `${actor} changed it. Please review again`
    // Design reviews retired on 2026-10-18; existing rows keep a neutral past tense.
    case "review_responded": return `${actor} responded to your review`
    // Reminders (#127) come from Lane, not a person, so they never name one. Overdue stays neutral.
    case "release_reminder": return "Still Done. Record the release once it is live"
    case "result_due_soon": return "Result due soon"
    case "result_due": return "Result due today. You can close it now"
    case "result_overdue": return "Result overdue. Close it when you have the numbers"
    case "invite_accepted": return null
    default: return `${actor} updated it`
  }
}

export function notificationRow(item: NotificationCopyInput, time?: string): NotificationRowCopy {
  const actor = item.actorName?.trim() || ACTOR_FALLBACK
  const code = requestCode(item.requestNumber) ?? "Request"
  const subject = item.reframedProblem?.trim() || item.requestTitle?.trim() || null
  const primary = item.type === "invite_accepted" ? `${actor} accepted your invite` : subject ? `${code} · ${subject}` : code
  const secondary = notificationEvent(item.type, actor)
  const detail = item.detail?.trim() || null
  const name = [primary, secondary, detail, time, item.readAt ? null : "unread"].filter(Boolean).join(", ")
  const target = item.type === "invite_accepted" ? `${actor}’s invite` : requestCode(item.requestNumber) ?? "notification"
  const toggle = `Mark ${target} ${item.readAt ? "unread" : "read"}`
  return { primary, secondary, detail, name, toggle }
}
