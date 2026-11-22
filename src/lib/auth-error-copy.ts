import { CODE_COULD_NOT_SEND, INVITATION_COULD_NOT_SEND } from "./auth-email-copy"

/**
 * #369: what a person reads when an auth call fails, keyed by the error code in Better Auth's answer (or the
 * `error` on Google's redirect back) and by Lane's own codes. Better Auth's own message is never shown, and no
 * entry says "owner". Safe in the browser. The words come from #346's prototype screens; each later increment 3
 * ticket adds the codes its tests meet.
 */
export const SOMETHING_WENT_WRONG = "Something went wrong. Try again."

export const AUTH_ERROR_COPY = {
  // Sign-up
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "A Lane account already uses this email.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  PASSWORD_COMPROMISED: "This password has appeared in a data breach elsewhere. Choose a different one.",
  // Sign-in. Proposed for Nikhil (#371): #346 has no state for an address that was never confirmed.
  EMAIL_NOT_VERIFIED: "This email isn’t confirmed yet. Email yourself a code to confirm it.",
  INVALID_EMAIL_OR_PASSWORD: "That email and password don’t match. Try again, or email yourself a code.",
  // Turnstile: no token, or Turnstile didn't pass it. #346 has no words of its own, so the generic line.
  MISSING_RESPONSE: SOMETHING_WENT_WRONG,
  VERIFICATION_FAILED: SOMETHING_WENT_WRONG,
  // Google's redirect back, `?error=account_not_linked`: Google didn't confirm an email a Lane account uses.
  account_not_linked: "Google sign-in didn’t finish. Try again, or use your email.",
  // Email codes (#372). A code is burnt after 3 wrong tries, so too many tries reads as used up: only a new code helps.
  NO_ACCOUNT: "No Lane account uses this email.",
  INVALID_OTP: "That code isn’t right. Check the most recent email from Lane.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "That code has expired. Send a new one.",
  // Proposed for Nikhil (#372), from #346's "Too many tries. Wait a minute, then try again.": a fourth code to one
  // address in 10 minutes. The wait is at most 10 minutes, so it says so rather than a minute.
  TOO_MANY_CODES: "Too many codes sent to this email. Wait 10 minutes, then try again.",
  // Lane's codes for a send that failed (#358's sentences).
  CODE_NOT_SENT: CODE_COULD_NOT_SEND,
  INVITATION_NOT_SENT: INVITATION_COULD_NOT_SEND,
} as const satisfies Record<string, string>

/** Lane's words for an auth error code. A code it doesn't know, or none, gets the generic line. */
export function authErrorCopy(code: string | null | undefined): string {
  return code && Object.hasOwn(AUTH_ERROR_COPY, code) ? AUTH_ERROR_COPY[code as keyof typeof AUTH_ERROR_COPY] : SOMETHING_WENT_WRONG
}
