/**
 * #358 the auth-email sender, dormant: nothing in the app calls it until increment 3 wires it into Better Auth.
 * It writes the plain-text sign-up, sign-in and reset codes and the workspace invitation, and sends each through
 * the Resend adapter Inbox email uses. Every send comes back sent or couldn't send; it never throws.
 */
import "server-only"
import { createHash } from "node:crypto"
import type { WorkspacePermission } from "./auth-guard"
import { emailPause, type EmailPause } from "./email-pause"
import { authEmail } from "./feature-switches"
import { isResendRefusal, resendMessenger } from "./messenger"

type CodeEmail = { to: string; code: string; expiresInMinutes: number }

/** The kinds map one-to-one onto what increment 3 receives from Better Auth, which does the mapping. */
export type AuthEmail =
  | ({ kind: "sign_up_code" } & CodeEmail)
  | ({ kind: "sign_in_code" } & CodeEmail)
  | ({ kind: "reset_code" } & CodeEmail)
  | {
      kind: "invitation"
      to: string
      workspaceName: string
      inviterName: string
      role: WorkspacePermission
      /** The invitation's only link. */
      acceptUrl: string
      expiresAt: Date
    }

export type AuthEmailResult = { ok: true } | { ok: false; reason: string }

/** #333 Q7, the one source: what a person waiting for a code sees when it couldn't be sent. */
export const CODE_COULD_NOT_SEND = "We couldn’t send the code right now. Sign in with your password or Google, or try again later."
/** For the Admin who sent an invitation that couldn't be sent. Proposed in #361; Nikhil confirms the words. */
export const INVITATION_COULD_NOT_SEND = "We couldn’t send the invitation email right now. Try sending it again later, or share the invitation link with them yourself."

/** Seams for tests: by default the process env, the global fetch, the KV-backed pause and the clock. */
export type SendAuthEmailOptions = {
  env?: Record<string, string | undefined>
  fetch?: typeof fetch
  emailPause?: EmailPause
  now?: () => Date
}

const minutes = (count: number) => `${count} ${count === 1 ? "minute" : "minutes"}`
const IGNORE_IT = "If you didn’t ask for this code, you can ignore this email. Nothing changes."

/** Lane's workspace-role words (GLOSSARY.md), with their article. Never "Owner". */
const AS_ROLE: Record<WorkspacePermission, string> = { admin: "as an Admin", member: "as a Member", guest: "as a Guest", viewer: "as a Viewer" }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const twoDigits = (value: number) => String(value).padStart(2, "0")
/** Written out by hand in UTC, so every server says the same thing whatever its locale or zone. */
const utcMoment = (at: Date) => `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()} at ${twoDigits(at.getUTCHours())}:${twoDigits(at.getUTCMinutes())} UTC`

/** Plain text, built only from the email's own inputs. The code comes first, so a notification preview shows it. */
function messageOf(email: AuthEmail): { subject: string; text: string } {
  if (email.kind === "invitation")
    return {
      // Fixed: nothing the inviter typed goes into the subject of mail from Lane's domain.
      subject: "You’re invited to a Lane workspace",
      text: [
        `${email.inviterName} invited you to join ${email.workspaceName} on Lane ${AS_ROLE[email.role]}.`,
        `Accept the invitation:\n${email.acceptUrl}`,
        `The invitation expires on ${utcMoment(email.expiresAt)}.`,
      ].join("\n\n"),
    }
  const lifetime = `It lasts ${minutes(email.expiresInMinutes)}.`
  switch (email.kind) {
    case "sign_up_code":
      return {
        subject: "Your Lane verification code",
        text: [`Your Lane verification code is ${email.code}`, `Enter it on the sign-up screen to verify your email address. ${lifetime}`, IGNORE_IT].join("\n\n"),
      }
    case "sign_in_code":
      return {
        subject: "Your Lane sign-in code",
        text: [`Your Lane sign-in code is ${email.code}`, `Enter it on the sign-in screen to sign in. ${lifetime}`, IGNORE_IT].join("\n\n"),
      }
    case "reset_code":
      return {
        subject: "Your Lane password reset code",
        text: [
          `Your Lane password reset code is ${email.code}`,
          `Enter it on the reset screen to choose a new password. ${lifetime} Resetting your password signs you out of Lane on your other devices.`,
          IGNORE_IT,
        ].join("\n\n"),
      }
  }
}

/**
 * A double-click or a retried call sends one email. A code's key is its kind, address and code. An invitation's is
 * its link and expiry, because a resend moves the expiry and must not be dropped as Resend's 24-hour duplicate.
 */
function idempotencyKeyOf(email: AuthEmail): string {
  const parts = email.kind === "invitation" ? [email.kind, email.acceptUrl, email.expiresAt.toISOString()] : [email.kind, email.to, email.code]
  return `lane-auth-${createHash("sha256").update(parts.join("\n")).digest("hex")}`
}

/**
 * Sends one auth email, or says why it couldn't: `resend_<status>`, `resend_timeout`, `resend_unreachable`, or
 * `not_configured` while either env name is unset. Each couldn't-send logs once, with the kind and the reason only.
 * Auth first: a refusal pauses Inbox email for the rest of the UTC day, and auth email never checks that pause.
 */
export async function sendAuthEmail(email: AuthEmail, options: SendAuthEmailOptions = {}): Promise<AuthEmailResult> {
  const { env, fetch, emailPause: pause = emailPause, now = () => new Date() } = options
  const couldNotSend = (reason: string): AuthEmailResult => {
    console.error(`[auth-email] Couldn't send ${email.kind}: ${reason}`)
    return { ok: false, reason }
  }
  const config = authEmail(env)
  if (!config.configured) return couldNotSend("not_configured")
  const { subject, text } = messageOf(email)
  const result = await resendMessenger({ apiKey: config.apiKey, from: config.from, fetch }).send({ channel: "email", to: email.to, subject, text, idempotencyKey: idempotencyKeyOf(email) })
  if (result.ok) return { ok: true }
  // The pause never throws; a failed write is its own log line and leaves this result unchanged.
  if (isResendRefusal(result.reason)) await pause.pause(now())
  return couldNotSend(result.reason)
}
