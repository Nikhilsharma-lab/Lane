"use client"

import { useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { usePendingMutationWriter, type PendingMutations, type RequestPatch } from "./pending-mutations-provider"

/** What every Request action returns: `{ error }` on a refusal, anything else on success. */
export type ActionResult = { error?: string } | { success?: boolean }

export type OptimisticOutcome<R> =
  | { status: "success"; value: R }
  | { status: "error"; error: string; thrown: boolean }
  /** An earlier action on this Request failed, so this one was never sent. */
  | { status: "skipped" }

export type OptimisticOptions<R> = {
  id: string
  /** Shown in the same tick and kept until the server rows show it. Omit for actions with no row change. */
  patch?: Omit<RequestPatch, "since">
  run: () => Promise<R>
  /** Replaces the default failure toast (an inline alert, or a toast the move already owns). */
  onError?: (message: string, detail: { thrown: boolean }) => void
  /** Waits for the action already in flight on this Request and is not sent if it failed (Undo after Mark Done). */
  waitForPending?: boolean
  /** Re-syncs the page after a failure. On by default; batch callers refresh once themselves. */
  refreshOnError?: boolean
}

export type BatchResult = { error?: string; moved?: string[]; failed?: { id: string; error: string }[] }
export type BatchOutcome =
  | { status: "success"; moved: string[]; failed: { id: string; error: string }[] }
  | { status: "error"; error: string; thrown: boolean }

/** The overlay's write side. These functions keep their identity across renders. */
export type OverlayWriter = Pick<PendingMutations, "begin" | "confirm" | "rollback" | "track" | "settled">

export type OptimisticDeps = {
  overlay: OverlayWriter | null
  /** Re-syncs the page with the server. Only failure paths call it. */
  refresh: () => void
  /** Asks Clerk for a fresh session token before the one retry. */
  refreshToken: () => Promise<void>
  /** The default failure feedback. */
  notifyError: (message: string) => void
}

export const FAILURE_TITLE = "Could not update this Request"
const CONNECTION_ERROR = "Check your connection and try again."
// actions.ts is a "use server" module and can only export async functions, so
// the guard's refusal copy (CANNOT_CHANGE_REQUESTS there) is matched here.
const AUTH_REFUSAL = /can't change Requests in this workspace/i
const AUTH_THROW = /\b(401|403)\b|unauthori[sz]ed|unauthenticated|forbidden|signed out|sign in/i

const errorOf = (result: unknown) =>
  result && typeof result === "object" && "error" in result && typeof result.error === "string" && result.error ? result.error : null

const authShaped = (failure: { error: string } | { thrown: unknown }) =>
  "error" in failure ? AUTH_REFUSAL.test(failure.error) : failure.thrown instanceof Error && AUTH_THROW.test(`${failure.thrown.name} ${failure.thrown.message}`)

/** Runs an action and, when the failure looks like an expired session (a tab
 * left hidden is the likely cause), refreshes the Clerk token and retries once. */
async function withAuthRetry<R>(run: () => Promise<R>, refreshToken: () => Promise<void>): Promise<{ value: R } | { thrown: unknown }> {
  for (let attempt = 0; ; attempt++) {
    let outcome: { value: R } | { thrown: unknown }
    try { outcome = { value: await run() } }
    catch (thrown) { outcome = { thrown } }
    const error = "value" in outcome ? errorOf(outcome.value) : null
    const retry = attempt === 0 && ("thrown" in outcome ? authShaped(outcome) : error !== null && authShaped({ error }))
    if (!retry) return outcome
    await refreshToken().catch(() => undefined)
  }
}

/**
 * The one way a Request mutation reaches the screen (plan item 1.5). The patch
 * shows in the same tick, stays after success until the server rows show it,
 * and rolls back with feedback on a refusal or a throw. Success never refreshes
 * the router: every action revalidates, so its response already carries the rows.
 */
export async function runOptimistic<R>(deps: OptimisticDeps, options: OptimisticOptions<R>): Promise<OptimisticOutcome<R>> {
  const { overlay } = deps
  const token = options.patch && overlay ? overlay.begin(options.id, options.patch) : null
  const previous = options.waitForPending && overlay ? overlay.settled(options.id) : null

  let finish: (succeeded: boolean) => void = () => {}
  overlay?.track(options.id, new Promise<boolean>(resolve => { finish = resolve }))

  const rollback = () => { if (token !== null) overlay?.rollback(options.id, token) }
  if (previous && !(await previous)) {
    rollback()
    finish(false)
    return { status: "skipped" }
  }

  const outcome = await withAuthRetry(options.run, deps.refreshToken)
  const error = "thrown" in outcome ? CONNECTION_ERROR : errorOf(outcome.value)
  if (error === null && "value" in outcome) {
    if (token !== null) overlay?.confirm(options.id, token)
    finish(true)
    return { status: "success", value: outcome.value }
  }

  const thrown = "thrown" in outcome
  const message = error ?? CONNECTION_ERROR
  rollback()
  finish(false)
  if (options.onError) options.onError(message, { thrown })
  else deps.notifyError(message)
  if (options.refreshOnError !== false) deps.refresh()
  return { status: "error", error: message, thrown }
}

/** The batch form for bulk pick up and Done (plan item 1.6): every row moves
 * in the same tick, one action moves them on the server, and only the rows it
 * did not move roll back. */
export async function runOptimisticBatch(deps: OptimisticDeps, options: {
  ids: string[]
  patch: Omit<RequestPatch, "since">
  run: () => Promise<BatchResult>
}): Promise<BatchOutcome> {
  const { overlay } = deps
  const tokens = new Map(options.ids.map(id => [id, overlay ? overlay.begin(id, options.patch) : null]))
  const finishers = new Map<string, (succeeded: boolean) => void>()
  for (const id of options.ids) overlay?.track(id, new Promise<boolean>(resolve => finishers.set(id, resolve)))
  const settle = (id: string, succeeded: boolean) => {
    const token = tokens.get(id)
    if (token !== null && token !== undefined) {
      if (succeeded) overlay?.confirm(id, token)
      else overlay?.rollback(id, token)
    }
    finishers.get(id)?.(succeeded)
  }

  const outcome = await withAuthRetry(options.run, deps.refreshToken)
  const error = "thrown" in outcome ? CONNECTION_ERROR : errorOf(outcome.value)
  if (error !== null || !("value" in outcome)) {
    for (const id of options.ids) settle(id, false)
    deps.refresh()
    return { status: "error", error: error ?? CONNECTION_ERROR, thrown: "thrown" in outcome }
  }

  const moved = new Set(outcome.value.moved ?? [])
  const failed = options.ids.filter(id => !moved.has(id)).map(id => ({
    id, error: outcome.value.failed?.find(item => item.id === id)?.error ?? "This Request changed before Lane could update it.",
  }))
  for (const id of options.ids) settle(id, moved.has(id))
  // Moved rows arrive in the action's own revalidated response; rows it did
  // not move were never revalidated, so only a partial failure re-syncs.
  if (failed.length) deps.refresh()
  return { status: "success", moved: [...moved], failed }
}

type ClerkGlobal = { Clerk?: { session?: { getToken(options?: { skipCache?: boolean }): Promise<string | null> } | null } }

/** Reads the Clerk instance ClerkProvider installs, so stories and fixtures
 * without a ClerkProvider still render; there the retry simply runs again. */
async function refreshClerkToken() {
  await (globalThis as ClerkGlobal).Clerk?.session?.getToken({ skipCache: true })
}

/** The router refresh for failure paths and the explicit Refresh control. It
 * lives here so the ESLint ban on router.refresh() has a single exception. */
export function useServerRefresh() {
  const router = useRouter()
  return useCallback(() => router.refresh(), [router])
}

function useOptimisticDeps(): OptimisticDeps {
  // The write side never changes identity, so runners built on it stay stable
  // and memoised rows stay put while patches come and go.
  const overlay = usePendingMutationWriter()
  const refresh = useServerRefresh()
  const { toast } = useToastStack()
  return useMemo(() => ({
    overlay,
    refresh,
    refreshToken: refreshClerkToken,
    notifyError: (message: string) => { toast({ type: "error", title: FAILURE_TITLE, description: message }) },
  }), [overlay, refresh, toast])
}

/** Returns a stable runner for one optimistic Request mutation. */
export function useOptimisticAction() {
  const deps = useOptimisticDeps()
  return useCallback(<R,>(options: OptimisticOptions<R>) => runOptimistic(deps, options), [deps])
}

/** Returns a stable runner for one optimistic bulk mutation. */
export function useOptimisticBatch() {
  const deps = useOptimisticDeps()
  return useCallback((options: Parameters<typeof runOptimisticBatch>[1]) => runOptimisticBatch(deps, options), [deps])
}
