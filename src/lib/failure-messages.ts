/**
 * #260 (polish bar §4): the one set of words Lane uses when a change or a read
 * doesn't get through. Raw server or network text ("Failed to fetch", an
 * exception's message) is never shown; callers pass what was thrown to
 * `thrownMessage` and get one of these instead.
 */

/** What any saving action says while the browser is offline. Nothing is changed or queued. As a
 * toast or alert title it has no full stop; inline it reads as a sentence. */
export const OFFLINE_ANSWER_TITLE = "You're offline, this will work when you're back"
export const OFFLINE_ANSWER = `${OFFLINE_ANSWER_TITLE}.`
/** The app frame's quiet line while offline. */
export const OFFLINE_LINE = "You're offline"
/** A change that didn't save: the toast title. */
export const SAVE_FAILED_TITLE = "Couldn't save"
/** What to do next when a call never got an answer. */
export const CHECK_CONNECTION = "Check your connection and try again."
export const SAVE_FAILED = `${SAVE_FAILED_TITLE}. ${CHECK_CONNECTION}`
export const LOAD_FAILED = `Couldn't load this. ${CHECK_CONNECTION}`
/** A read or change refused because nobody is signed in any more (the server's SESSION_ENDED). */
export const SESSION_ENDED = "Your session ended. Sign in again to continue."
/** A read or change refused because the session no longer matches this workspace. */
export const SESSION_CHANGED = "Your workspace session changed. Refresh the page to continue."
/** The label on every failure message's retry button. */
export const TRY_AGAIN = "Try again"

/** Thrown by `callAction` instead of calling the server while the browser is offline. */
export class OfflineError extends Error {
  constructor() {
    super(OFFLINE_ANSWER)
    this.name = "OfflineError"
  }
}

export const isOfflineError = (thrown: unknown): thrown is OfflineError => thrown instanceof OfflineError

/** What to say about a call that threw: the offline answer, or `fallback` (never the thrown text). */
export function thrownMessage(thrown: unknown, fallback: string = SAVE_FAILED): string {
  return isOfflineError(thrown) ? OFFLINE_ANSWER : fallback
}
