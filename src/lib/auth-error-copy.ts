import { CODE_COULD_NOT_SEND, INVITATION_COULD_NOT_SEND } from "./auth-email-copy"

/**
 * #369: what a person reads when an auth call fails, keyed by the error code in Better Auth's answer (or the
 * `error` on Google's redirect back) and by Lane's own codes. Better Auth's own message is never shown, and no
 * entry says "owner". Safe in the browser. The words come from #346's prototype screens; each later increment 3
 * ticket adds the codes its tests meet.
 */
export const SOMETHING_WENT_WRONG = "Something went wrong. Try again."

/** #333 Q4: the last Admin of a workspace can't leave it, be removed or stop being an Admin. */
export const ONLY_ADMIN = "You’re the only Admin. Make someone else an Admin before you leave."

/** #346: Google can't be disconnected while it's the only way a person signs in. */
export const GOOGLE_ONLY_METHOD = "Google is your only sign-in method. Set a password before disconnecting it."

const SLUG_TAKEN = "Another workspace already uses this URL. Choose a different one, then try again."

/** #346's googleFailed line, for every way Google sign-in can come back unfinished. */
export const GOOGLE_FAILED = "Google sign-in didn’t finish. Try again, or use your email."

/**
 * Every `error` the redirect back from Google sign-in can carry (Better Auth 1.7). Each one means the sign-in didn't
 * finish, and a person can only start again or use their email.
 */
const GOOGLE_REDIRECT_ERRORS = [
  // Better Auth's callback codes (its oauth2/errors).
  "no_code",
  "oauth_provider_not_found",
  "issuer_missing",
  "issuer_mismatch",
  "invalid_code",
  "nonce_binding_missing",
  "unable_to_get_user_info",
  "no_callback_url",
  "unable_to_link_account",
  "email_does_not_match",
  "account_already_linked_to_different_user",
  "email_not_found",
  "email_not_verified",
  // Its callback's own checks, and the sign-in's state.
  "invalid_callback_request",
  "state_not_found",
  "state_mismatch",
  "state_invalid",
  "internal_server_error",
  // Its sign-in result, spaces as underscores. `account_not_linked`: Google didn't confirm an email a Lane account uses.
  "account_not_linked",
  "unable_to_update_account",
  "signup_disabled",
  "unable_to_create_user",
  "unable_to_create_session",
  // Google's own, passed through (OAuth 2.0, RFC 6749 4.1.2.1). `access_denied`: the person cancelled at Google.
  "access_denied",
  "invalid_request",
  "unauthorized_client",
  "unsupported_response_type",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
] as const

const GOOGLE_REDIRECT_COPY = Object.fromEntries(GOOGLE_REDIRECT_ERRORS.map((error) => [error, GOOGLE_FAILED])) as Record<(typeof GOOGLE_REDIRECT_ERRORS)[number], string>

export const AUTH_ERROR_COPY = {
  // Sign-up
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "A Lane account already uses this email.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  // Proposed for Nikhil: Better Auth's longest password, in the short line's shape.
  PASSWORD_TOO_LONG: "Use at most 128 characters.",
  PASSWORD_COMPROMISED: "This password has appeared in a data breach elsewhere. Choose a different one.",
  // Proposed for Nikhil: Lane's code for Have I Been Pwned not answering. The password is refused until it does.
  PASSWORD_CHECK_UNAVAILABLE: "We couldn’t check this password right now. Try again in a minute.",
  // Sign-in. Proposed for Nikhil (#371): #346 has no state for an address that was never confirmed.
  EMAIL_NOT_VERIFIED: "This email isn’t confirmed yet. Email yourself a code to confirm it.",
  INVALID_EMAIL_OR_PASSWORD: "That email and password don’t match. Try again, or email yourself a code.",
  // Turnstile. Proposed for Nikhil (his rule on #369: every error a person can meet says how to fix it).
  // No token: the widget hasn't finished. Turnstile refused the token, or it expired: a reload gives a new one.
  MISSING_RESPONSE: "Finish the check that you’re human, then try again.",
  VERIFICATION_FAILED: "We couldn’t confirm you’re human. Refresh the page and try again.",
  // Lane's code for Turnstile's siteverify not answering, so Better Auth's broad UNKNOWN_ERROR keeps the generic line.
  HUMAN_CHECK_UNAVAILABLE: "We couldn’t run the check that you’re human right now. Try again in a minute.",
  // Proposed for Nikhil: Lane's code for the check not being set up (no TURNSTILE_SECRET_KEY). A minute won't fix
  // it; Google sign-in doesn't need the check.
  HUMAN_CHECK_NOT_SET_UP: "We can’t run the check that you’re human, so this is off for now. Continue with Google instead, or try again later.",
  // Google's redirect back, `?error=<code>`.
  ...GOOGLE_REDIRECT_COPY,
  // Email codes (#372). A code is burnt after 3 wrong tries, so too many tries reads as used up: only a new code helps.
  NO_ACCOUNT: "No Lane account uses this email.",
  INVALID_OTP: "That code isn’t right. Check the most recent email from Lane.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "That code has expired. Send a new one.",
  // Proposed for Nikhil (#372), from #346's "Too many tries. Wait a minute, then try again.": a fourth code to one
  // address in 10 minutes. The wait is at most 10 minutes, so it says so rather than a minute.
  TOO_MANY_CODES: "Too many codes sent to this email. Wait 10 minutes, then try again.",
  // Lane's code for Better Auth's own per-IP limit, which answers with none: #346's line.
  RATE_LIMITED: "Too many tries. Wait a minute, then try again.",
  // Lane's codes for a send that failed (#358's sentences).
  CODE_NOT_SENT: CODE_COULD_NOT_SEND,
  // A sign-up's verification code, sent or resent: #346's sendFailedSignup. The account isn't confirmed, so password
  // sign-in, which CODE_NOT_SENT offers, would be refused.
  SIGN_UP_CODE_NOT_SENT: "We couldn’t send the code right now. Try again in a few minutes.",
  INVITATION_NOT_SENT: INVITATION_COULD_NOT_SEND,
  // Signed out, on any call that needs a session.
  UNAUTHORIZED: "You’re signed out. Sign in, then try again.",
  // Workspaces (#373). Every Admin is Better Auth's creator role, which it calls an owner: its "only owner" and
  // "without an owner" codes both mean the last Admin, and get #333 Q4's sentence.
  // Proposed for Nikhil: a workspace URL (Better Auth's slug) another workspace has. Creating one answers the first
  // code; checking or changing a URL, the second.
  ORGANIZATION_ALREADY_EXISTS: SLUG_TAKEN,
  ORGANIZATION_SLUG_ALREADY_TAKEN: SLUG_TAKEN,
  ORGANIZATION_DELETION_DISABLED:"Workspaces can’t be deleted in Lane. To stop someone using this one, remove them on the Members page in Settings.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: ONLY_ADMIN,
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: ONLY_ADMIN,
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "You’re no longer in this workspace. Ask one of its Admins to invite you again.",
  // Only an Admin manages the workspace (#369).
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: "Only an Admin can invite people. Ask an Admin of this workspace to send the invitation.",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "Only an Admin can change someone’s role. Ask an Admin of this workspace to change it.",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "Only an Admin can remove someone. Ask an Admin of this workspace to remove them.",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "Only an Admin can rename the workspace. Ask an Admin of this workspace to rename it.",
  // Proposed for Nikhil (#373): a role Lane doesn't have, such as an owner or several roles at once.
  ROLE_NOT_IN_LANE: "Lane has no such role. Choose Admin, Member, Guest or Viewer.",
  // Invitations (#373).
  INVITATION_LIMIT_REACHED: "This workspace already has 100 invitations waiting. Cancel some on the Members page in Settings, then invite again.",
  // Proposed for Nikhil (#396): Lane's code for inviting someone into a workspace that has 100 people. Better Auth
  // refuses only as they accept, with the next one.
  WORKSPACE_FULL: "This workspace already has 100 people, Lane’s limit. Remove someone, then invite again.",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "This workspace already has 100 people, Lane’s limit. Ask an Admin to remove someone, then accept again.",
  // Expired, cancelled, or already accepted.
  INVITATION_NOT_FOUND: "This invitation has expired or is no longer open. Ask the person who invited you to send a new one.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "This invitation was sent to a different email. Sign in with that email to accept it.",
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: "Confirm your email before you accept. Email yourself a code to confirm it.",
  // Workspace rows (#381). Lane's own last-Admin refusal reads as Better Auth's only-owner codes do.
  ONLY_ADMIN,
  // Proposed for Nikhil (#381): removing someone another Admin removed first.
  MEMBER_NOT_FOUND: "This person is no longer in this workspace. Reload the page to see who’s in it now.",
  // Proposed for Nikhil (#396): Lane's code for an Admin removing themselves, which the screen never offers.
  CANNOT_REMOVE_YOURSELF: "You can’t remove yourself. Leave the workspace in Settings instead.",
  // Settings → Profile's account section (#380). Changing a password with the wrong current one, and unlinking the
  // last sign-in method: #346's words.
  INVALID_PASSWORD: "That isn’t your current password.",
  FAILED_TO_UNLINK_LAST_ACCOUNT: GOOGLE_ONLY_METHOD,
  // Proposed for Nikhil (#394): a first password sent from a page opened before one was set; Better Auth disconnects
  // Google only within a day of signing in; a device another tab, or that device, already signed out.
  PASSWORD_ALREADY_SET: "Your account already has a password. Reload the page to change it.",
  SESSION_NOT_FRESH: "You signed in more than a day ago. Sign out and sign in again, then try this again.",
  DEVICE_NOT_FOUND: "This device is already signed out. Reload the page to see where you’re signed in now.",
  // Lane's codes for Google's redirect back to Settings after Connect Google (`googleConnectionCode`): its
  // `email_does_not_match`, its `account_already_linked_to_different_user`, and any other `error`. The redirect's own
  // codes keep the sign-in line, which tells a person to use their email instead. Nikhil's words (2026-11-23).
  GOOGLE_EMAIL_DOES_NOT_MATCH: "That Google account uses a different email, so nothing changed. Choose the Google account that uses your Lane email.",
  GOOGLE_ALREADY_LINKED: "That Google account is already connected to another Lane account.",
  GOOGLE_NOT_CONNECTED: "Google didn’t connect, so nothing changed. Try again.",
} as const satisfies Record<string, string>

/**
 * The error code in a Better Auth or Lane error answer's JSON body (`{ code, message }`), if it has one. The one
 * reader of that format: the auth server, the screens and the route tests all use it.
 */
export function authErrorCode(body: unknown): string | undefined {
  const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined
  return typeof code === "string" && code ? code : undefined
}

/**
 * Lane's code for Google's redirect back to Settings after Connect Google (its `?error=`, one of
 * `GOOGLE_REDIRECT_ERRORS`): a Google account with a different email, one another Lane account already has, or any
 * other way the connection didn't finish. Either way nothing changed. Better Auth 1.7 sends the redirect's
 * `account_already_linked_to_different_user`; its `LINKED_ACCOUNT_ALREADY_EXISTS` is never thrown.
 */
export function googleConnectionCode(redirectError: string): "GOOGLE_EMAIL_DOES_NOT_MATCH" | "GOOGLE_ALREADY_LINKED" | "GOOGLE_NOT_CONNECTED" {
  if (redirectError === "email_does_not_match") return "GOOGLE_EMAIL_DOES_NOT_MATCH"
  if (redirectError === "account_already_linked_to_different_user") return "GOOGLE_ALREADY_LINKED"
  return "GOOGLE_NOT_CONNECTED"
}

/** Lane's words for an auth error code. A code it doesn't know, or none, gets the generic line. */
export function authErrorCopy(code: string | null | undefined): string {
  return isAuthErrorCode(code) ? AUTH_ERROR_COPY[code] : SOMETHING_WENT_WRONG
}

/** An error code Lane has words for: the keys every map from a code to a field, offer or screen is keyed by. */
export type AuthErrorCode = keyof typeof AUTH_ERROR_COPY

export const isAuthErrorCode = (code: string | null | undefined): code is AuthErrorCode =>
  Boolean(code) && Object.hasOwn(AUTH_ERROR_COPY, code as string)

/** What `map` holds for `code`; nothing for a code Lane has no words for, or none. */
export const forCode = <V>(map: Partial<Record<AuthErrorCode, V>>, code: string | null | undefined): V | undefined =>
  isAuthErrorCode(code) ? map[code] : undefined

/** A map from each of `codes` to `value`, such as the field their line belongs on. */
export const eachCode = <V>(codes: readonly AuthErrorCode[], value: V): Partial<Record<AuthErrorCode, V>> =>
  Object.fromEntries(codes.map((code) => [code, value]))

/** A typed code refused: wrong, expired, or used up. Its line belongs on the code field. */
export const CODE_REFUSALS = ["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"] as const satisfies readonly AuthErrorCode[]

/** A new password refused for itself. Its line belongs on the new password's field. */
export const NEW_PASSWORD_REFUSALS = ["PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG", "PASSWORD_COMPROMISED", "PASSWORD_CHECK_UNAVAILABLE"] as const satisfies readonly AuthErrorCode[]
