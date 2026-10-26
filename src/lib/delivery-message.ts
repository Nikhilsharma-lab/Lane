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

function footer(item: NeedsYouItem, workspaceName: string, channel: "email" | "slack"): string {
  // Only people who chose Slack DM get one, so Off doesn't apply to it.
  if (channel === "slack") return `You get one Slack message for each item that needs you in ${workspaceName}. To change that, choose Email or Off in Lane under Settings, Inbox delivery.`
  // Result due ignores Off, so it never offers Off as a way to stop it.
  if (item.kind === "result_due") return `Lane sends Result due by email even when Inbox delivery is Off, so a result is never missed. Workspace: ${workspaceName}.`
  return `You get one email for each item that needs you in ${workspaceName}. To stop them, choose Off in Lane under Settings, Inbox delivery.`
}

/** Slack reads `&`, `<` and `>` as markup (links, mentions); people's words must stay words. */
const slackSafe = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/**
 * The same words for a Slack DM (#207): there is no subject, so the DM opens with it, and what people wrote is
 * escaped for Slack. Still one item and exactly one link, the Request.
 */
export function deliveryMessage(
  item: NeedsYouItem,
  { appUrl, workspaceName, channel = "email" }: { appUrl: string; workspaceName: string; channel?: "email" | "slack" },
): DeliveryMessageCopy {
  const safe = channel === "slack" ? slackSafe : (text: string) => text
  const code = requestCodeOrNull(item.requestNumber ?? undefined)
  const name = item.reframedProblem?.trim() || item.requestTitle?.trim() || "Untitled Request"
  const requestLine = code ? `${code} · ${name}` : name
  const link = `${appUrl}/requests/${item.requestId}`
  const detail = item.detail?.trim()
  const subject = `${event(item)}: ${requestLine}`
  const lines = [
    ...(channel === "slack" ? [safe(subject), ""] : [requestLine, "", `${event(item)}.`]),
    ask(item),
    ...(detail ? ["", safe(item.kind === "concern" ? `Concern: ${detail}` : `Question: ${detail}`)] : []),
    "",
    `Open the Request: ${link}`,
    "",
    safe(footer(item, workspaceName, channel)),
  ]
  return { subject, text: lines.join("\n"), link }
}

/** What a Guest's email is about (#212): the Member who took it on, or how it was Closed. */
export type GuestEmail = { kind: "taken_on"; takerName: string | null } | { kind: "closed"; closure: "measured" | "without_result" }

/**
 * #212: one of the two emails a Guest gets about their submission. Plain text, one Request, exactly one link. The
 * footer says why they get it, since a Guest has no delivery choice to change.
 */
export function guestMessage(
  email: GuestEmail,
  request: { requestId: string; requestNumber: number | null; title: string | null; reframedProblem: string | null },
  { appUrl, workspaceName }: { appUrl: string; workspaceName: string },
): DeliveryMessageCopy {
  const code = requestCodeOrNull(request.requestNumber ?? undefined)
  const name = request.reframedProblem?.trim() || request.title?.trim() || "Untitled Request"
  const requestLine = code ? `${code} · ${name}` : name
  const link = `${appUrl}/requests/${request.requestId}`
  const taker = email.kind === "taken_on" ? email.takerName?.trim() || "A Member" : ""
  const subject = email.kind === "taken_on" ? `${taker} took on your Request: ${requestLine}` : `Your Request is Closed: ${requestLine}`
  const body = email.kind === "taken_on"
    ? `${taker} took on your Request and is now its Requester. They write what it should change and follow it through. You can still read it and comment.`
    : email.closure === "measured"
      ? "Your Request is Closed with its result. See what changed."
      : "Your Request is Closed without a result. See why it closed."
  const lines = [
    requestLine,
    "",
    body,
    "",
    `Open the Request: ${link}`,
    "",
    `As a Guest in ${workspaceName}, you get two emails about each Request you submit: when a Member takes it on, and when it is Closed.`,
  ]
  return { subject, text: lines.join("\n"), link }
}
