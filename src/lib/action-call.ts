/**
 * The one way the browser calls a Server Action. Each action is sent once: an ended session comes back as the action's
 * own answer (src/lib/auth-guard.ts), which callers show like any refusal, and is never sent again (#397).
 * #260: while the browser is offline it calls nothing and rejects with
 * `OfflineError` (src/lib/connection-status.ts); callers say the shared
 * "You're offline" answer (src/lib/failure-messages.ts). Nothing is queued for later.
 */
import { isExpiredActionResult } from "./action-session-failure"
import { isOffline } from "./connection-status"
import { OfflineError } from "./offline-error"

/** Whether an action answered that the session ended. A throw never says so: it can follow a committed write or a
 * lost response. */
export function isSessionFailure(outcome: { value: unknown } | { thrown: unknown }): boolean {
  return "value" in outcome && isExpiredActionResult(outcome.value)
}

export async function callAction<R>(run: () => Promise<R>): Promise<R> {
  if (isOffline()) throw new OfflineError()
  // After the event that asked: sent inside the router's own step (help's hash change), Next discards the answer and the
  // page never shows it. Waiting for Clerk's token used to leave this step.
  await Promise.resolve()
  return run()
}
