/**
 * #206: the messenger interface Inbox delivery sends through, with its adapters. One message is one Needs-you
 * item; nothing here bundles. The Email adapter calls Resend's API (the build plan's transactional email
 * service) and is used only when the Email switch is on with its credentials (`src/lib/feature-switches.ts`).
 * Otherwise delivery uses the recording stand-in: it sends nothing and keeps the messages for whoever holds it,
 * and the delivery log records "would send".
 */
import { createHash } from "node:crypto"

export type OutgoingMessage = {
  channel: "email"
  /** The recipient's address. */
  to: string
  subject: string
  /** Plain text, with exactly one link: the Request. */
  text: string
  /** Stable per person and item, so the provider drops an accidental repeat too. */
  idempotencyKey: string
}

export type SendResult = { ok: true } | { ok: false; reason: string }

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
