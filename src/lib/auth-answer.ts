/**
 * #376: the one shape every auth answer has. Lane's browser auth client answers with it, and so do the callbacks the
 * Settings, workspace and Onboarding views take (story 103: "success or an error code"), which increment 5's
 * adapters write. A failure carries Better Auth's or Lane's error code, read with `authErrorCopy`; with no code it
 * gets the generic line.
 */
export type AuthAnswer<T = unknown> = { ok: true; data?: T } | { ok: false; code?: string }

/** What Lane's server door (`askAuthServer`) answers: an `AuthAnswer` whose success always carries what was answered. */
export type DoorAnswer<T> = { ok: true; data: T } | { ok: false; code?: string }

/** Runs a call that answers an `AuthAnswer`. One that throws (offline, blocked, an old tab) is a failure with no code. */
export async function settle<T>(call: () => Promise<AuthAnswer<T>>): Promise<AuthAnswer<T>> {
  try {
    return await call()
  } catch {
    return { ok: false }
  }
}
