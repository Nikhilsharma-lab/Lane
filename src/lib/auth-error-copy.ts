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

/** #346's googleFailed line, for every way Google sign-in can come back unfinished. */
const GOOGLE_FAILED = "Google sign-in didn’t finish. Try again, or use your email."

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
  INVITATION_NOT_SENT: INVITATION_COULD_NOT_SEND,
  // Signed out, on any call that needs a session.
  UNAUTHORIZED: "You’re signed out. Sign in, then try again.",
  // Workspaces (#373). Every Admin is Better Auth's creator role, which it calls an owner: its "only owner" and
  // "without an owner" codes both mean the last Admin, and get #333 Q4's sentence.
  ORGANIZATION_DELETION_DISABLED: "Workspaces can’t be deleted in Lane. To stop someone using this one, remove them on the Members page in Settings.",
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
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "This workspace already has 100 people, Lane’s limit. Ask an Admin to remove someone, then accept again.",
  // Expired, cancelled, or already accepted.
  INVITATION_NOT_FOUND: "This invitation has expired or is no longer open. Ask the person who invited you to send a new one.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "This invitation was sent to a different email. Sign in with that email to accept it.",
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: "Confirm your email before you accept. Email yourself a code to confirm it.",
} as const satisfies Record<string, string>

/** Lane's words for an auth error code. A code it doesn't know, or none, gets the generic line. */
export function authErrorCopy(code: string | null | undefined): string {
  return code && Object.hasOwn(AUTH_ERROR_COPY, code) ? AUTH_ERROR_COPY[code as keyof typeof AUTH_ERROR_COPY] : SOMETHING_WENT_WRONG
}
