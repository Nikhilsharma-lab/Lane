import { OfflineError } from "./offline-error"

/**
 * #260 (polish bar §4): the one set of words Lane uses when a change or a read
 * doesn't get through. Raw server or network text ("Failed to fetch", an
 * exception's message) is never shown; callers pass what was thrown to
 * `thrownMessage` and get one of these instead.
 */

/** The app frame's quiet offline line, and the title wherever Lane says the browser is offline. */
export const OFFLINE_LINE = "You're offline"
/** What a failure message adds when the person's typing survived it. */
export const TEXT_KEPT = "Your text is still here."
/** What any saving action says while the browser is offline. Nothing is changed or queued. As a
 * toast or alert title it has no full stop; inline it reads as a sentence. */
export const OFFLINE_ANSWER_TITLE = "You're offline, this will work when you're back"
export const OFFLINE_ANSWER = `${OFFLINE_ANSWER_TITLE}.`
/** A change that didn't save: the toast title. */
export const SAVE_FAILED_TITLE = "Couldn't save"
/** What to do next when a call never got an answer. */
export const CHECK_CONNECTION = "Check your connection and try again."
/** A read or change refused because nobody is signed in any more (the server's SESSION_ENDED). */
export const SESSION_ENDED = "Your session ended. Sign in again to continue."
/** A read or change refused because the session no longer matches this workspace. */
export const SESSION_CHANGED = "Your workspace session changed. Refresh the page to continue."
/** The label on every failure message's retry button. */
export const TRY_AGAIN = "Try again"

export const isOfflineError = (thrown: unknown): thrown is OfflineError => thrown instanceof OfflineError

/** What to say about a call that threw: the offline answer, or the caller's own `fallback` (never the thrown text). */
export const thrownMessage = (thrown: unknown, fallback: string) => isOfflineError(thrown) ? OFFLINE_ANSWER : fallback

/**
 * A failure whose message is already words for people (a server's refusal, or one of the messages above), thrown
 * where a caller passes a failure on as an error. `failureWords` shows its message as it is.
 */
export class ShownFailure extends Error {}

/** The words to show for a failure: a `ShownFailure`'s own, else what `thrownMessage` says (never a raw error's text). */
export const failureWords = (failure: unknown, fallback: string) => failure instanceof ShownFailure ? failure.message : thrownMessage(failure, fallback)
