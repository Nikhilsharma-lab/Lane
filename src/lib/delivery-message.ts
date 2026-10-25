/**
 * #206: what one delivered Needs-you item says. Plain text, one item per message, and exactly one link: the
 * Request. The words match the Inbox row (`src/components/inbox/needs-you-copy.ts`). Pure.
 */
import type { NeedsYouItem } from "./inbox-read-model"
import { journeyDate } from "./request-journey"
import { requestCodeOrNull } from "./request-code"

export type DeliveryMessageCopy = { subject: string; text: string; link: string }

function event(item: NeedsYouItem): string {
  switch (item.kind) {
    case "review": return "Waiting for your review"
    case "concern": return `${item.reviewerName?.trim() || "A Reviewer"} raised a concern`
    case "record_release": return "Record the release"
    case "result_due": return `Result due ${item.dueDate ? journeyDate(item.dueDate) : "now"}`
  }
}

function ask(item: NeedsYouItem): string {
  switch (item.kind) {
    case "review": return "You were asked to review this Request. Answer Looks good or Raise a concern before work starts."
    case "concern": return "A Reviewer raised a concern on your Request. Read it before work starts."
    case "record_release": return "This Request has been Done for 3 days. Record the release once it is live, so the result can be measured."
    case "result_due": return "The measurement window has ended. Record the result and close the Request."
  }
}

function footer(item: NeedsYouItem, workspaceName: string): string {
  // Result due ignores Off, so it never offers Off as a way to stop it.
  if (item.kind === "result_due") return `Lane sends Result due by email even when Inbox delivery is Off, so a result is never missed. Workspace: ${workspaceName}.`
  return `You get one email for each item that needs you in ${workspaceName}. To stop them, choose Off in Lane under Settings, Inbox delivery.`
}

export function deliveryMessage(item: NeedsYouItem, { appUrl, workspaceName }: { appUrl: string; workspaceName: string }): DeliveryMessageCopy {
  const code = requestCodeOrNull(item.requestNumber ?? undefined)
  const name = item.reframedProblem?.trim() || item.requestTitle?.trim() || "Untitled Request"
  const requestLine = code ? `${code} · ${name}` : name
  const link = `${appUrl}/requests/${item.requestId}`
  const detail = item.detail?.trim()
  const lines = [
    requestLine,
    "",
    `${event(item)}.`,
    ask(item),
    ...(detail ? ["", item.kind === "concern" ? `Concern: ${detail}` : `Question: ${detail}`] : []),
    "",
    `Open the Request: ${link}`,
    "",
    footer(item, workspaceName),
  ]
  return { subject: `${event(item)}: ${requestLine}`, text: lines.join("\n"), link }
}
