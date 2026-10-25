/**
 * #206: the messenger interface Inbox delivery sends through, with its adapters. One message is one Needs-you
 * item; nothing here bundles. The Email adapter calls Resend's API (the build plan's transactional email
 * service) and is used only when the Email switch is on with its credentials (`src/lib/feature-switches.ts`).
 * Otherwise delivery uses the recording stand-in: it sends nothing and keeps the messages for whoever holds it,
 * and the delivery log records "would send".
 */
import { createHash } from "node:crypto"

export type OutgoingMessage = {
  /** Email, or a Slack DM (#207) in the workspace's connected Slack. */
  channel: "email" | "slack"
  /** The recipient's address. A Slack DM finds the person in Slack by it. */
  to: string
  subject: string
  /** Plain text, with exactly one link: the Request. */
  text: string
  /** Stable per person and item, so the provider drops an accidental repeat too. */
  idempotencyKey: string
}

/**
 * `useEmail`: this channel can't reach the person at all (not in the connected Slack, or Slack no longer
 * accepts the workspace's token), so the item should go by Email instead. Without it, the failure is passing
 * and a later run tries the same channel again.
 */
export type SendResult = { ok: true } | { ok: false; reason: string; useEmail?: true }

export type Messenger = {
  /** What the delivery log records for a message this messenger accepted. */
  readonly outcome: "sent" | "would_send"
  send(message: OutgoingMessage): Promise<SendResult>
}

/** The stand-in: accepts every message, sends none, and keeps them in order. */
export function recordingMessenger(): Messenger & { messages: OutgoingMessage[] } {
  const messages: OutgoingMessage[] = []
  return {
    outcome: "would_send",
    messages,
    async send(message) {
      messages.push(message)
      return { ok: true }
    },
  }
}

export const RESEND_EMAILS_URL = "https://api.resend.com/emails"

/** Resend allows 256 characters; a hash keeps every key well inside that. */
export const idempotencyKeyOf = (orgId: string, userId: string, itemKey: string) =>
  `lane-inbox-${createHash("sha256").update(`${orgId}\n${userId}\n${itemKey}`).digest("hex")}`

/**
 * The Email adapter. A failure comes back as a reason (never thrown) carrying no address or content, so the
 * caller can release the item for a later run and log only the reason.
 */
export function resendMessenger({ apiKey, from, fetch: send = fetch }: { apiKey: string; from: string; fetch?: typeof fetch }): Messenger {
  return {
    outcome: "sent",
    async send(message) {
      try {
        const response = await send(RESEND_EMAILS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey },
          body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(10_000),
        })
        return response.ok ? { ok: true } : { ok: false, reason: `resend_${response.status}` }
      } catch (error) {
        return { ok: false, reason: error instanceof Error && error.name === "TimeoutError" ? "resend_timeout" : "resend_unreachable" }
      }
    },
  }
}

export const SLACK_API = "https://slack.com/api"

/** Slack errors meaning this token or person can't be reached at all; anything else is passing. */
const SLACK_UNREACHABLE = new Set(["users_not_found", "user_not_found", "invalid_auth", "token_revoked", "account_inactive", "not_authed", "missing_scope", "channel_not_found", "cannot_dm_bot", "user_disabled"])

/**
 * #207 the Slack DM adapter: one DM per message from the workspace's Lane app, to the person whose Slack
 * account has the same email address (`users.lookupByEmail`, looked up once per run), then `chat.postMessage`.
 * Slack has no idempotency key, so the delivery log's claim alone keeps an item to one DM. Failures come back
 * as reasons (never thrown) carrying no address, token or content.
 */
export function slackMessenger({ token, fetch: send = fetch }: { token: string; fetch?: typeof fetch }): Messenger {
  const people = new Map<string, string>()
  async function call(method: string, init: { body: string; type: string }): Promise<{ ok: true; answer: Record<string, unknown> } | { ok: false; reason: string; useEmail?: true }> {
    try {
      const response = await send(`${SLACK_API}/${method}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": init.type },
        body: init.body,
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) return { ok: false, reason: `slack_${response.status}` }
      const answer = (await response.json()) as { ok?: boolean; error?: string }
      if (answer.ok) return { ok: true, answer }
      const error = answer.error ?? "refused"
      return SLACK_UNREACHABLE.has(error) ? { ok: false, reason: `slack_${error}`, useEmail: true } : { ok: false, reason: `slack_${error}` }
    } catch (error) {
      return { ok: false, reason: error instanceof Error && error.name === "TimeoutError" ? "slack_timeout" : "slack_unreachable" }
    }
  }
  return {
    outcome: "sent",
    async send(message) {
      let person = people.get(message.to)
      if (!person) {
        const found = await call("users.lookupByEmail", { type: "application/x-www-form-urlencoded", body: new URLSearchParams({ email: message.to }).toString() })
        if (!found.ok) return found
        const id = (found.answer.user as { id?: string } | undefined)?.id
        if (!id) return { ok: false, reason: "slack_users_not_found", useEmail: true }
        people.set(message.to, (person = id))
      }
      const posted = await call("chat.postMessage", {
        type: "application/json; charset=utf-8",
        body: JSON.stringify({ channel: person, text: message.text, unfurl_links: false, unfurl_media: false }),
      })
      return posted.ok ? { ok: true } : posted
    },
  }
}
