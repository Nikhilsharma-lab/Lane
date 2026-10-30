import { isExpiredActionResult } from "./action-session-failure"

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

/** Only an explicit pre-write expiry result permits recovery. Throws can
 * follow a committed write or a lost response and must never authorize replay. */
export function isSessionFailure(outcome: { value: unknown } | { thrown: unknown }): boolean {
  return "value" in outcome && isExpiredActionResult(outcome.value)
}

/** Best-effort token lookup, then at most one replay after usable renewal.
 * Calling the same closure retains the original workspace and operation ID;
 * the server guard derives identity afresh on each attempt. */
export async function callAction<R>(run: () => Promise<R>, session: ActionSession = clerkActionSession): Promise<R> {
  await session.current().catch(() => undefined)
  const value = await run()
  if (!isExpiredActionResult(value)) return value
  const token = await session.renew().catch(() => undefined)
  if (typeof token !== "string" || !token.trim()) return value
  return run()
}
