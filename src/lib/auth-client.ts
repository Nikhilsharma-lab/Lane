/**
 * #377 (spec #376): Lane's browser auth client. One Better Auth client from its browser entry, with the email-code
 * and organization client plugins, talking to increment 3's server at `/api/auth`. Dormant: only Lane's new auth
 * screens and their tests import it (eslint.config.mjs), and no route mounts those until increment 5.
 *
 * Each call answers an `AuthAnswer` (`auth-answer.ts`): `{ ok: true, data }` or `{ ok: false, code }`. The code is read
 * with `authErrorCode`, and a fetch that throws (offline, blocked) is a failure with no code, which `authErrorCopy`
 * turns into the generic line.
 * Better Auth's own message is never passed on. Calls that need Turnstile take its token and send it in Better Auth's
 * captcha header.
 */
import { createAuthClient } from "better-auth/client"
import { emailOTPClient, organizationClient } from "better-auth/client/plugins"

import { settle, type AuthAnswer } from "./auth-answer"
import { authErrorCode } from "./auth-error-copy"

/** Why a code is emailed: to sign in, to confirm a new account's email, or to reset a password. */
export type CodePurpose = "sign-in" | "confirm" | "reset"

const CODE_TYPES = { "sign-in": "sign-in", confirm: "email-verification", reset: "forget-password" } as const

/** Better Auth's captcha plugin reads Turnstile's token from this header. */
const CAPTCHA_HEADER = "x-captcha-response"

const client = createAuthClient({
  // No baseURL: in the browser Better Auth uses the page's origin and its `/api/auth` path.
  plugins: [emailOTPClient(), organizationClient()],
  fetchOptions: {
    // Better Auth keeps the fetch it finds when the client is made. Reading it per call keeps the network one seam.
    customFetchImpl: (input, init) => globalThis.fetch(input, init),
  },
})

const withToken = (token: string) => ({ headers: { [CAPTCHA_HEADER]: token } })

type ClientResult<T> = { data: T | null; error: unknown }

/** Better Auth's `{ data, error }` as Lane's `AuthAnswer`: the one place that format is read. */
function answer<T>(call: () => Promise<ClientResult<T>>): Promise<AuthAnswer<T>> {
  return settle(async () => {
    const { data, error } = await call()
    return error ? { ok: false, code: authErrorCode(error) } : { ok: true, data: data as T }
  })
}

export function signInWithPassword({ email, password }: { email: string; password: string }) {
  return answer(() => client.signIn.email({ email, password }))
}

/** Turnstile. Better Auth answers with no session: the email must be confirmed first. */
export function signUp({ name, email, password }: { name: string; email: string; password: string }, token: string) {
  return answer(() => client.signUp.email({ name, email, password }, withToken(token)))
}

/** Turnstile. Emails a 6-digit code for `purpose`. */
export function sendCode({ email, purpose }: { email: string; purpose: CodePurpose }, token: string) {
  return answer(() => client.emailOtp.sendVerificationOtp({ email, type: CODE_TYPES[purpose] }, withToken(token)))
}

export function signInWithCode({ email, code }: { email: string; code: string }) {
  return answer(() => client.signIn.emailOtp({ email, otp: code }))
}

/** Confirms a new account's email with its code. Lane's server doesn't sign in from this (increment 3). */
export function confirmEmail({ email, code }: { email: string; code: string }) {
  return answer(() => client.emailOtp.verifyEmail({ email, otp: code }))
}

/** Turnstile. Emails a reset code. */
export function requestReset({ email }: { email: string }, token: string) {
  return answer(() => client.emailOtp.requestPasswordReset({ email }, withToken(token)))
}

/** Turnstile. Saves a new password with the reset code; the server signs out every device. */
export function resetPassword({ email, code, password }: { email: string; code: string; password: string }, token: string) {
  return answer(() => client.emailOtp.resetPassword({ email, otp: code, password }, withToken(token)))
}

/**
 * Starts Google sign-in. Better Auth answers with Google's address and the browser goes there; Google comes back to
 * `returnTo`, or to `errorTo` with `?error=<code>` when it didn't finish.
 */
export function signInWithGoogle({ returnTo, errorTo }: { returnTo: string; errorTo: string }) {
  return answer(() => client.signIn.social({ provider: "google", callbackURL: returnTo, errorCallbackURL: errorTo }))
}

export function signOut() {
  return answer(() => client.signOut())
}

export function acceptInvitation(invitationId: string) {
  return answer(() => client.organization.acceptInvitation({ invitationId }))
}

export function declineInvitation(invitationId: string) {
  return answer(() => client.organization.rejectInvitation({ invitationId }))
}
