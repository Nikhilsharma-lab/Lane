/**
 * Reopen (GLOSSARY.md): a Done Request goes back to In progress for 15 minutes after it was marked Done, until the
 * release is recorded. The minutes count from the saved Done time (`requests.done_at`), so the Done step's button and
 * the server's undo of Mark Done end together, and an unrelated edit can't restart them. Pure and client-safe.
 */
export const REOPEN_WINDOW_MS = 15 * 60 * 1000

/** When Reopen ends for a Request marked Done at `doneAt` (epoch milliseconds). */
export const reopenEndsAt = (doneAt: string | Date) => new Date(doneAt).getTime() + REOPEN_WINDOW_MS
