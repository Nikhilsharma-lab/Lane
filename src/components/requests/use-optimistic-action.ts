"use client"

import { useCallback, useMemo } from "react"
import { useStableRouter } from "@/components/shell/stable-router"
import { useToastStack, type ToastOptions } from "@/components/arc/toast-stack/toast-stack"
import { callAction, clerkActionSession, isSessionFailure, type ActionSession } from "@/lib/action-call"
import { isOffline } from "@/lib/connection-status"
import { CHECK_CONNECTION, OFFLINE_ANSWER, OFFLINE_ANSWER_TITLE, SAVE_FAILED_TITLE, TRY_AGAIN, isOfflineError, thrownMessage } from "@/lib/failure-messages"
import { usePendingMutationWriter, type PendingMutations, type RequestPatch } from "./pending-mutations-provider"

/** What every Request action returns: `{ error }` on a refusal, anything else on success. */
export type ActionResult = { error?: string } | { success?: boolean }

export type OptimisticOutcome<R> =
  | { status: "success"; value: R }
  /** `offline`: the browser was offline, so nothing was shown or sent (#260). */
  | { status: "error"; error: string; thrown: boolean; offline?: boolean }
  /** An earlier action on this Request failed, so this one was never sent. */
  | { status: "skipped" }

export type OptimisticOptions<R> = {
  id: string
  /** Shown in the same tick and kept until the server rows show it. Omit for actions with no row change. */
  patch?: Omit<RequestPatch, "since">
  run: () => Promise<R>
  /** Replaces the default failure toast (an inline alert, or a toast the move already owns). */
  /** `auth` is true when the failure looks like an expired session even after the one token refresh. */
  onError?: (message: string, detail: FailureDetail) => void
  /** Waits for the action already in flight on this Request and is not sent if it failed (Undo after Mark Done). */
  waitForPending?: boolean
  /** Re-syncs the page after a failure. On by default; batch callers refresh once themselves. */
  refreshOnError?: boolean
}

/** What a failure hands its feedback (#260): `offline` when nothing was sent, and `retry`, the Try again
 * that sends the same change once more. Nothing is retried on its own. */
export type FailureDetail = { thrown: boolean; auth: boolean; offline: boolean; retry: () => Promise<unknown> }

export type BatchResult = { error?: string; moved?: string[]; failed?: { id: string; error: string }[] }
export type BatchOutcome =
  | { status: "success"; moved: string[]; failed: { id: string; error: string }[] }
  | { status: "error"; error: string; thrown: boolean }

/** The overlay's write side. These functions keep their identity across renders. */
export type OverlayWriter = Pick<PendingMutations, "begin" | "confirm" | "rollback" | "track" | "settled">

export type OptimisticDeps = {
  overlay: OverlayWriter | null
  /** Re-syncs the page with the server. Only failure paths call it; `useServerRefresh` skips it offline. */
  refresh: () => void
  /** The session token every call refreshes first (`callAction`). */
  session: ActionSession
  /** The default failure feedback: "Couldn't save" (or the offline answer) with Try again. */
  notifyError: (message: string, detail: FailureDetail) => void
  /** Whether the browser is offline (src/lib/connection-status.ts by default). */
  offline?: () => boolean
}

const thrownError = (thrown: unknown) => thrownMessage(thrown, CHECK_CONNECTION)

const errorOf = (result: unknown) =>
  result && typeof result === "object" && "error" in result && typeof result.error === "string" && result.error ? result.error : null

/** `callAction`, settled: the action's result or what it threw. */
async function attempt<R>(run: () => Promise<R>, session: ActionSession): Promise<{ value: R } | { thrown: unknown }> {
  try { return { value: await callAction(run, session) } }
  catch (thrown) { return { thrown } }
}

/**
 * The one way a Request mutation reaches the screen (plan item 1.5). The patch
 * shows in the same tick, stays after success until the server rows show it,
 * and rolls back with feedback on a refusal or a throw. Success never refreshes
 * the router: every action revalidates, so its response already carries the rows.
 * #260: offline, nothing is shown or sent and the feedback is the shared offline
 * answer; a failure re-syncs through `useServerRefresh`, which skips it offline, because a refresh offline
 * makes Next.js fall back to a full page load onto the browser's "No internet" page.
 * Every failure's feedback carries Try again; nothing is queued.
 */
export async function runOptimistic<R>(deps: OptimisticDeps, options: OptimisticOptions<R>): Promise<OptimisticOutcome<R>> {
  const { overlay } = deps
  const offline = deps.offline ?? isOffline
  const fail = (message: string, detail: Omit<FailureDetail, "retry">) => {
    const full = { ...detail, retry: () => runOptimistic(deps, options) }
    if (options.onError) options.onError(message, full)
    else deps.notifyError(message, full)
  }
  if (offline()) {
    fail(OFFLINE_ANSWER, { thrown: true, auth: false, offline: true })
    return { status: "error", error: OFFLINE_ANSWER, thrown: true, offline: true }
  }
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

  const outcome = await attempt(options.run, deps.session)
  const error = "thrown" in outcome ? thrownError(outcome.thrown) : errorOf(outcome.value)
  if (error === null && "value" in outcome) {
    if (token !== null) overlay?.confirm(options.id, token)
    finish(true)
    return { status: "success", value: outcome.value }
  }

  const thrown = "thrown" in outcome
  const message = error ?? CHECK_CONNECTION
  const wentOffline = thrown && isOfflineError(outcome.thrown)
  rollback()
  finish(false)
  fail(message, { thrown, auth: isSessionFailure(outcome), offline: wentOffline })
  if (options.refreshOnError !== false) deps.refresh()
  return { status: "error", error: message, thrown, offline: wentOffline || undefined }
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

  const outcome = await attempt(options.run, deps.session)
  const error = "thrown" in outcome ? thrownError(outcome.thrown) : errorOf(outcome.value)
  if (error !== null || !("value" in outcome)) {
    for (const id of options.ids) settle(id, false)
    deps.refresh()
    return { status: "error", error: error ?? CHECK_CONNECTION, thrown: "thrown" in outcome }
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

/** The router refresh for failure paths and the explicit Refresh control. It
 * lives here so the ESLint ban on router.refresh() has a single exception
 * (stable-router.tsx only holds the router it calls, #296).
 * #260: offline it does nothing, because the refresh would fail and Next.js
 * would fall back to a full page load onto the browser's "No internet" page. */
export function useServerRefresh() {
  const router = useStableRouter()
  return useCallback(() => { if (!isOffline()) router.refresh() }, [router])
}

/** #260: the one failure toast. Offline it is the shared answer; otherwise "Couldn't save" says what
 * happened. Both carry Try again, which sends the same change again only when pressed. */
export function failureToast(message: string, { offline, retry }: Pick<FailureDetail, "offline" | "retry">): ToastOptions {
  const action = { label: TRY_AGAIN, onClick: () => { void retry() } }
  return offline
    ? { type: "warning", title: OFFLINE_ANSWER_TITLE, action }
    : { type: "error", title: SAVE_FAILED_TITLE, description: message, action }
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
    session: clerkActionSession,
    notifyError: (message: string, detail: FailureDetail) => { toast(failureToast(message, detail)) },
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
