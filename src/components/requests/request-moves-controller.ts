import type { ToastOptions, ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { requestCodeOrNull } from "@/lib/request-code"
import { REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants"
import { availableMove, pickupBlockedMessage, type LifecycleMove, type LifecycleRequest } from "@/lib/request-lifecycle"
import type { ReviewState } from "@/lib/request-reviewer-rules"
import type { AskIsItLive } from "./is-it-live"
import type { Announce } from "./list-announcer"
import { showMarkedDone, type MarkDoneUndoStore } from "./mark-done-undo"
import type { ConfirmPickup } from "./pickup-confirmation"
import { failureToast, type ActionResult, type BatchOutcome, type BatchResult, type OptimisticOptions, type OptimisticOutcome, type runOptimisticBatch } from "./use-optimistic-action"
import { SAVE_FAILED_TITLE } from "@/lib/failure-messages"

/** The Request a move acts on: its id, the name its toasts use (the saved code, else the title)
 * and, for a pick up, its saved reviews (#77). */
export type MoveTarget = { id: string; name: string; reviewState?: ReviewState | null }

/** A list row as a MoveTarget: named by its saved code, else its title. */
export function moveTarget(row: { id: string; requestNumber?: number; reframedProblem: string | null; title: string; reviewState?: ReviewState | null }): MoveTarget {
  return { id: row.id, name: requestCodeOrNull(row.requestNumber) ?? row.reframedProblem ?? row.title, reviewState: row.reviewState }
}

export type MoveOptions = {
  /** Replaces the failure description when the action threw (a lost response), so the copy can say what to check. */
  networkError?: string
  /** Pick up only: who becomes the Assignee, shown in the same frame (Request detail's panel). */
  assignee?: { id: string; name: string }
  /** The caller's pending display begins only after confirmation, just before execution. */
  onStart?: () => void
}

export type MoveOutcome = OptimisticOutcome<unknown> | { status: "busy" } | { status: "cancelled" }

/** Existing lifecycle facts and the person who can complete a blocked measurement plan. */
export type BulkMoveTarget = MoveTarget & LifecycleRequest & { requester: string | null }
export type BulkMoveOutcome = (BatchOutcome & {
  failed: { id: string; error: string }[]
  notReadyOnly: boolean
  /** The data settled, but this invocation no longer owns the caller's view. */
  detached: boolean
}) | { status: "busy" } | { status: "cancelled" }

type Scope = { orgId: string }
const EARLIER_CHANGE_FAILED = "An earlier change failed. Check this Request and try again."

/** The server actions the moves call (src/app/(app)/requests/[id]/actions.ts). */
export type RequestMoveActions = {
  markDone: (requestId: string, scope: Scope) => Promise<ActionResult>
  pickUpRequest: (requestId: string, scope: Scope) => Promise<ActionResult>
  undoMarkDone: (requestId: string, scope: Scope) => Promise<ActionResult>
  setRequestPriority: (requestId: string, priority: RequestPriority, scope: Scope) => Promise<ActionResult>
  pickUpRequests: (requestIds: string[], scope: Scope) => Promise<BatchResult>
  markDoneMany: (requestIds: string[], scope: Scope) => Promise<BatchResult>
}

export type RequestMovesDeps = {
  orgId: string
  announce: Announce
  afterMove?: (id: string, name: string) => void
  toast: ToastStackApi["toast"]
  update: ToastStackApi["update"]
  optimistic: <R>(options: OptimisticOptions<R>) => Promise<OptimisticOutcome<R>>
  optimisticBatch: (options: Parameters<typeof runOptimisticBatch>[1]) => Promise<BatchOutcome>
  /** Reconciles skipped single Undo and failed bulk reversals through the existing server refresh. */
  refresh: () => void
  confirmPickup: ConfirmPickup
  /** Capture the workspace generation at invocation, not at render or hook mount. */
  continuation: () => () => boolean
  copyText: (value: string, copied: string) => Promise<boolean>
  actions: RequestMoveActions
  /** Moves in flight, by `${id}:${kind}`; the hook keeps one set across renders. */
  busy?: Set<string>
  /** Where the latest Mark Done's Undo is kept for the palette; the app's one pointer by default. */
  undoStore?: MarkDoneUndoStore
  /** #135: asked after a successful Mark Done, with that Done's Undo. */
  isItLive?: AskIsItLive
}

/**
 * Plan item 2.5: the list's Request moves, extracted from request-row-actions.tsx
 * so Request detail and the ⌘K palette run the same ones with the same copy.
 * Every move goes through the pending-mutation overlay (plan item 1.5): Pick
 * up is said in the polite region in the same frame, Mark Done confirms at
 * once in a toast that carries Undo, and a failure replaces that toast or
 * raises its own. `afterMove` runs once a move has started (the list keeps
 * focus on the moved row) and after an Undo succeeds. useRequestMoves is the
 * React binding; this takes every boundary as a dependency.
 */
export function createRequestMoves({ orgId, announce, afterMove, toast, update, optimistic, optimisticBatch, refresh, confirmPickup, continuation, copyText, actions, busy = new Set(), undoStore, isItLive }: RequestMovesDeps) {
  // Settle an operation's own visible toast after navigation, without recreating one in the new view.
  const finishToast = (id: string, result: ToastOptions, current: () => boolean) => {
    if (current()) toast({ ...result, id })
    else update(id, result)
  }
  // Results reuse the toast's id: an update if it is still showing, a fresh toast if it was dismissed meanwhile.
  // Undo is sent only after the Done move it reverses has succeeded.
  const undo = async (toastId: string, requestId: string, name: string, ended: () => boolean, originCurrent: () => boolean) => {
    const current = continuation()
    update(toastId, { type: "loading", title: "Undoing", description: `${name} is moving back to In progress.`, action: undefined })
    const outcome = await optimistic({
      id: requestId,
      patch: { kind: "undo", status: "in_progress" },
      run: () => actions.undoMarkDone(requestId, { orgId }),
      waitForPending: true,
      // #260: Try again sends the same Undo again; offline it says so instead.
      onError: (description, { offline }) => {
        const retry = () => undo(toastId, requestId, name, ended, originCurrent)
        finishToast(toastId, { ...failureToast(description, { offline, retry }), ...(offline ? {} : { title: "Couldn't undo" }) }, current)
      },
    })
    // A failed Done already replaced this toast. A later failed Release may only have had inline feedback.
    if (outcome.status === "skipped" && !ended()) {
      finishToast(toastId, { type: "error", title: "Couldn't undo", description: EARLIER_CHANGE_FAILED, action: undefined }, current)
      refresh()
    }
    if (outcome.status !== "success") return
    finishToast(toastId, { type: "success", title: "Back to In progress", description: `${name} is In progress again.`, action: undefined }, current)
    if (current() && originCurrent()) afterMove?.(requestId, name)
  }

  /** One toast per move: Done confirms at once with Undo, and a failure replaces that same toast. */
  const start = (request: MoveTarget, kind: LifecycleMove, current: () => boolean, { networkError, assignee }: MoveOptions = {}): Promise<MoveOutcome> => {
    const { name } = request
    // Done leaves the working views, so its confirmation carries the way back; the palette's Undo runs the same one (#103).
    const done: ReturnType<typeof showMarkedDone> | null = kind === "done"
      ? showMarkedDone(toast, request, (id, requestId, name) => undo(id, requestId, name, () => done?.ended ?? true, current), undoStore)
      : null
    const toastId = done?.toastId
    // Done is acknowledged by its toast; a pick up is acknowledged here, in the same frame as the move.
    if (kind === "pick-up") announce("Picked up. The Request is now In progress.", { key: "row-change" })
    const describe = (message: string, thrown: boolean) => thrown && networkError ? networkError : message
    // #260: every failure carries Try again, which runs the whole move again (its toast, its announcement).
    const failed = (message: string, { thrown, offline }: { thrown: boolean; offline: boolean }) =>
      failureToast(offline ? message : describe(message, thrown), { offline, retry: () => start(request, kind, continuation(), { networkError, assignee }) })
    const outcome = optimistic({
      id: request.id,
      patch: kind === "done" ? { kind: "done", status: "done" }
        : { kind: "pick-up", status: "in_progress", ...(assignee ? { assignedTo: assignee.id, assigneeName: assignee.name, assigneeAvatarUrl: null } : {}) },
      run: () => (kind === "done" ? actions.markDone : actions.pickUpRequest)(request.id, { orgId }),
      waitForPending: true,
      onError: toastId
        ? (message, detail) => { done?.end(); finishToast(toastId, failed(message, detail), current) }
        : (message, detail) => { if (current()) toast(failed(message, detail)) },
    }).then(result => {
      // A preceding failed write can skip Done before submission without invoking onError.
      if (result.status === "skipped" && done) {
        done.end()
        finishToast(done.toastId, { type: "error", title: SAVE_FAILED_TITLE, description: EARLIER_CHANGE_FAILED, action: undefined }, current)
      }
      // The failure toast speaks for itself; the region drops the claim it made.
      if (result.status === "error" && kind === "pick-up" && current()) announce("", { key: "row-change" })
      // #135: once the Done is saved, ask whether the work is live. "Not yet" brings this toast's Undo back.
      if (result.status === "success" && done && !done.consumed && current()) isItLive?.({ id: request.id, name }, {
        reshow: done.restore,
        end: () => {
          done.end()
          finishToast(done.toastId, { type: "success", title: "Release recorded", description: `${name} is now Measuring.`, action: undefined }, current)
        },
      })
      return result
    })
    afterMove?.(request.id, name)
    return outcome
  }

  // #77: a pick up with an open concern or an unanswered review asks "Pick up anyway?" first.
  // With nothing outstanding the confirmation resolves at once and the move starts before the next paint.
  const move = async (request: MoveTarget, kind: LifecycleMove, options?: MoveOptions): Promise<MoveOutcome> => {
    const current = continuation()
    const key = `${request.id}:${kind}`
    if (busy.has(key)) return { status: "busy" }
    busy.add(key)
    try {
      if (kind === "pick-up" && !(await confirmPickup([request]))) return { status: "cancelled" }
      if (!current()) return { status: "cancelled" }
      options?.onStart?.()
      return await start(request, kind, current, options)
    } finally { busy.delete(key) }
  }

  // Bulk keeps its own one-shot operation; it never replaces the single palette pointer.
  const confirmManyDone = (targets: BulkMoveTarget[]) => {
    let consumed = false
    const noun = targets.length === 1 ? "Request" : "Requests"
    const undoMany = async (toastId: string) => {
      if (consumed) return
      consumed = true
      const current = continuation()
      update(toastId, { type: "loading", title: "Undoing", description: `Moving ${targets.length} ${noun} back to In progress.`, action: undefined })
      const outcomes = await Promise.all(targets.map(target => optimistic({
        id: target.id, patch: { kind: "undo", status: "in_progress" },
        run: () => actions.undoMarkDone(target.id, { orgId }), waitForPending: true,
        onError: () => {}, refreshOnError: false,
      })))
      const failed = outcomes.flatMap((outcome, index) => outcome.status === "success" ? [] : [{
        id: targets[index].id, error: `${targets[index].name}: ${outcome.status === "error" ? outcome.error : EARLIER_CHANGE_FAILED}`,
      }])
      if (failed.length) refresh()
      const result = failed.length
        ? { type: "error" as const, title: `${failed.length} of ${targets.length} couldn't be undone`, description: failed.map(item => item.error).join(" "), action: undefined }
        : { type: "success" as const, title: `${targets.length} ${noun} back to In progress`, description: undefined, action: undefined }
      // An explicitly invoked toast finishes even after navigation; a dismissed one does not reappear in a new view.
      finishToast(toastId, result, current)
    }
    toast({ type: "success", title: `${targets.length} ${noun} marked Done`, duration: 10_000,
      action: { label: "Undo", onClick: id => { void undoMany(id) } },
    })
  }

  const moveMany = async (targets: BulkMoveTarget[], kind: LifecycleMove, options: {
    isGuest: boolean
    readOnly?: boolean
    /** Selection's retained operation/scope, independent of workspace navigation. */
    current: () => boolean
    onStart?: (count: number) => void
  }): Promise<BulkMoveOutcome> => {
    const navigationCurrent = continuation()
    const current = () => navigationCurrent() && options.current()
    const notReady = targets.flatMap(target => {
      const offered = availableMove(target, options)
      const reason = offered?.move !== kind ? "This Request changed before Lane could update it."
        : kind === "pick-up" && offered.blockedReason ? pickupBlockedMessage(offered.blockedReason, target.requester) : null
      return reason ? [{ id: target.id, error: `${target.name}: ${reason}` }] : []
    })
    const ready = targets.filter(target => !notReady.some(failure => failure.id === target.id))
    const ids = ready.map(target => target.id)
    const keys = ids.map(id => `${id}:${kind}`)
    if (keys.some(key => busy.has(key))) return { status: "busy" }
    keys.forEach(key => busy.add(key))
    try {
      if (!current()) return { status: "cancelled" }
      if (!ids.length) return { status: "success", moved: [], failed: notReady, notReadyOnly: notReady.length > 0, detached: false }
      if (kind === "pick-up" && !(await confirmPickup(ready))) return { status: "cancelled" }
      if (!current()) return { status: "cancelled" }
      options.onStart?.(ids.length)
      const outcome = await optimisticBatch({ ids,
        patch: kind === "pick-up" ? { kind: "pick-up", status: "in_progress" } : { kind: "done", status: "done" },
        run: () => (kind === "pick-up" ? actions.pickUpRequests : actions.markDoneMany)(ids, { orgId }),
      })
      const failed = outcome.status === "success" ? outcome.failed
        : ids.map(id => ({ id, error: outcome.thrown ? "" : outcome.error }))
      if (kind === "done" && outcome.status === "success" && outcome.moved.length && current()) {
        confirmManyDone(ready.filter(target => outcome.moved.includes(target.id)))
      }
      return { ...outcome, failed: [...failed, ...notReady], notReadyOnly: failed.length === 0 && notReady.length > 0, detached: !current() }
    } finally { keys.forEach(key => busy.delete(key)) }
  }

  const setPriority = (requestId: string, priority: RequestPriority) => {
    announce(`Priority set to ${REQUEST_PRIORITY_LABELS[priority].toLowerCase()}.`, { key: "row-change" })
    return optimistic({
      id: requestId,
      patch: { kind: "priority", priority },
      run: () => actions.setRequestPriority(requestId, priority, { orgId }),
    }).then(outcome => {
      if (outcome.status === "error") announce("", { key: "row-change" })
      return outcome
    })
  }

  const copy = (value: string, label: string) => copyText(value, `${label} copied.`)

  return { move, moveMany, setPriority, copy }
}

export type RequestMoves = ReturnType<typeof createRequestMoves>
