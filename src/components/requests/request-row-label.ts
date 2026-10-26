import { REQUEST_PRIORITY_LABELS, REQUEST_TYPE_LABELS, type RequestPriority } from "@/lib/request-constants"
import { rowDue, rowJourney, type OverviewRequest } from "@/lib/request-overview"
import { concernMarker } from "@/lib/request-reviewer-rules"
import { WAITING_TO_BE_TAKEN_ON } from "@/lib/guest-submission"

/**
 * Plan item 2.4: the accessible name of a Request row, the list's one tab stop,
 * so every value the row shows is read without a stop per pill. For example
 * "LAN-12, Signup drops at the phone step. In progress, High priority, Website,
 * Bug, Assignee Sam Lee". Dates are left out: they need the viewer's time zone,
 * which the first render does not know. A Measuring row's due tag is read after
 * its status ("Measuring, Due in 3 days"), on `now`'s UTC date (#133).
 */
export function requestRowLabel(request: OverviewRequest, identity?: { code: string; priority: RequestPriority } | null, labelNames?: string[], now: Date = new Date()) {
  const code = identity?.code || ""
  const title = request.reframedProblem ?? request.title
  const priority = identity?.priority ?? request.priority ?? "none"
  const due = rowDue(request, now)
  const facts = [
    rowJourney(request).label,
    ...(due.kind === "none" ? [] : [due.label]),
    // #212: "Waiting to be taken on", as the row's tag shows.
    ...(request.guestSubmission === "waiting" ? [WAITING_TO_BE_TAKEN_ON] : []),
    priority === "none" ? REQUEST_PRIORITY_LABELS.none : `${REQUEST_PRIORITY_LABELS[priority]} priority`,
    request.projectName ?? (request.projectId ? "Unavailable Project" : "No Project"),
    ...(labelNames ?? (request.requestType ? [REQUEST_TYPE_LABELS[request.requestType]] : [])),
    request.assignedTo ? `Assignee ${request.assigneeName?.trim() || "Unknown member"}` : "No assignee",
    // #77: "2 concerns" on an Open row with a reviewer's concern open, as the row's marker shows.
    ...[concernMarker(request)].filter((marker): marker is string => marker !== null),
  ]
  return `${code ? `${code}, ` : ""}${title}. ${facts.join(", ")}`
}

/** "1 Request matches" or "{n} Requests match". The toolbar shows it; the list announces it with a full stop. */
export function matchCountText(count: number) {
  return `${count} ${count === 1 ? "Request matches" : "Requests match"}`
}

/** "1 Request" or "{n} Requests". */
export function requestCount(count: number) {
  return `${count} ${count === 1 ? "Request" : "Requests"}`
}
