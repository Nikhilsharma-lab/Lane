/**
 * #358's couldn't-send sentences, safe in the browser so the auth error copy (auth-error-copy.ts) can use them on
 * the screens. The server-only sender re-exports them from auth-email.ts.
 */

/** #333 Q7, the one source: what a person waiting for a code sees when it couldn't be sent. */
export const CODE_COULD_NOT_SEND = "We couldn’t send the code right now. Sign in with your password or Google, or try again later."
/** For the Admin who sent an invitation that couldn't be sent. Wording confirmed by Nikhil on #364 (2026-11-21). */
export const INVITATION_COULD_NOT_SEND = "We couldn’t send the invitation email right now. Try sending it again later, or share the invitation link with them yourself."
