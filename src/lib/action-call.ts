/**
 * The one way the browser calls a server action. A tab left hidden lets the
 * short-lived Clerk session token lapse, and a server action then reads as
 * signed out. So every call first asks Clerk for a current token (free while
 * the cached one is still valid), and a failure that still looks like an ended
 * session gets one fresh token and one retry. Otherwise `callAction(run)`
 * behaves exactly like `run()`: it resolves with the action's result, refusal
 * included, or rejects with what the action threw.
 */

/** Matches SESSION_ENDED (src/lib/auth-guard.ts), what any guarded action says
 * when nobody is signed in, and CANNOT_CHANGE_REQUESTS (request-transition.ts),
 * the Request moves' refusal. Server modules can't share the constants with the
 * browser bundle, so the copy is matched here. */
const AUTH_REFUSAL = /your session ended|can't change Requests in this workspace/i
const AUTH_THROW = /\b(401|403)\b|unauthori[sz]ed|unauthenticated|forbidden|signed out|sign in/i

/** Clerk's session token, as the browser holds it. */
export type ActionSession = {
  /** A current token: the cached one while valid, otherwise a new one. */
  current(): Promise<unknown>
  /** A new token, whatever the cache holds. */
  renew(): Promise<unknown>
}

type ClerkGlobal = { Clerk?: { session?: { getToken(options?: { skipCache?: boolean }): Promise<string | null> } | null } }
const clerkSession = () => (globalThis as ClerkGlobal).Clerk?.session

/** Reads the Clerk instance ClerkProvider installs; without one (fixtures,
 * tests) there is no token to refresh and the call simply runs. */
export const clerkActionSession: ActionSession = {
  current: async () => clerkSession()?.getToken(),
  renew: async () => clerkSession()?.getToken({ skipCache: true }),
}

/** Whether an action's result or throw reads as an ended session: the Request
 * guard's refusal, Intake's `session_expired` code, or an auth-shaped throw. */
export function isSessionFailure(outcome: { value: unknown } | { thrown: unknown }): boolean {
  if ("thrown" in outcome) {
    const thrown = outcome.thrown
    return thrown instanceof Error && AUTH_THROW.test(`${thrown.name} ${thrown.message}`)
  }
  const result = outcome.value
  if (!result || typeof result !== "object" || !("error" in result)) return false
  const error = result.error
  if (typeof error === "string") return AUTH_REFUSAL.test(error)
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "session_expired")
}

export async function callAction<R>(run: () => Promise<R>, session: ActionSession = clerkActionSession): Promise<R> {
  await session.current().catch(() => undefined)
  try {
    const value = await run()
    if (!isSessionFailure({ value })) return value
  } catch (thrown) {
    if (!isSessionFailure({ thrown })) throw thrown
  }
  await session.renew().catch(() => undefined)
  return run()
}
