import type { ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { requestCodeOrNull } from "@/lib/request-code"
import { REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants"
import type { LifecycleMove } from "@/lib/request-lifecycle"
import type { ReviewState } from "@/lib/request-reviewer-rules"
import type { AskIsItLive } from "./is-it-live"
import type { Announce } from "./list-announcer"
import { clearMarkedDone, showMarkedDone, type MarkDoneUndoStore } from "./mark-done-undo"
import type { ConfirmPickup } from "./pickup-confirmation"
import { failureToast, type ActionResult, type OptimisticOptions, type OptimisticOutcome } from "./use-optimistic-action"

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
  /** Pick up only: the caller already asked "Pick up anyway?" and the person confirmed. */
  confirmed?: boolean
}

export type MoveOutcome = OptimisticOutcome<unknown> | { status: "busy" } | { status: "cancelled" }

type Scope = { orgId: string }

/** The server actions the moves call (src/app/(app)/requests/[id]/actions.ts). */
export type RequestMoveActions = {
  markDone: (requestId: string, scope: Scope) => Promise<ActionResult>
  pickUpRequest: (requestId: string, scope: Scope) => Promise<ActionResult>
  undoMarkDone: (requestId: string, scope: Scope) => Promise<ActionResult>
  setRequestPriority: (requestId: string, priority: RequestPriority, scope: Scope) => Promise<ActionResult>
}

export type RequestMovesDeps = {
  orgId: string
  announce: Announce
  afterMove?: (id: string, name: string) => void
  toast: ToastStackApi["toast"]
  update: ToastStackApi["update"]
  optimistic: <R>(options: OptimisticOptions<R>) => Promise<OptimisticOutcome<R>>
  confirmPickup: ConfirmPickup
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
export function createRequestMoves({ orgId, announce, afterMove, toast, update, optimistic, confirmPickup, copyText, actions, busy = new Set(), undoStore, isItLive }: RequestMovesDeps) {
  // Marked Done toasts whose Undo has run: their Done no longer asks "Is it live?".
  const undone = new Set<string>()
  // Results reuse the toast's id: an update if it is still showing, a fresh toast if it was dismissed meanwhile.
  // Undo is sent only after the Done move it reverses has succeeded.
  const undo = async (toastId: string, requestId: string, name: string) => {
    undone.add(toastId)
    update(toastId, { type: "loading", title: "Undoing", description: `${name} is moving back to In progress.`, action: undefined })
    const outcome = await optimistic({
      id: requestId,
      patch: { kind: "undo", status: "in_progress" },
      run: () => actions.undoMarkDone(requestId, { orgId }),
      waitForPending: true,
      // #260: Try again sends the same Undo again; offline it says so instead.
      onError: (description, { offline }) => { toast({ id: toastId, ...failureToast(description, { offline, retry: () => undo(toastId, requestId, name) }), ...(offline ? {} : { title: "Couldn't undo" }) }) },
    })
    if (outcome.status !== "success") return
    toast({ id: toastId, type: "success", title: "Back to In progress", description: `${name} is In progress again.` })
    afterMove?.(requestId, name)
  }

  /** One toast per move: Done confirms at once with Undo, and a failure replaces that same toast. */
  const start = (request: MoveTarget, kind: LifecycleMove, { networkError, assignee }: MoveOptions = {}): Promise<MoveOutcome> => {
    const key = `${request.id}:${kind}`
    if (busy.has(key)) return Promise.resolve({ status: "busy" })
    busy.add(key)
    const { name } = request
    // Done leaves the working views, so its confirmation carries the way back; the palette's Undo runs the same one (#103).
    const toastId = kind === "done" ? showMarkedDone(toast, request, undo, undoStore) : null
    // Done is acknowledged by its toast; a pick up is acknowledged here, in the same frame as the move.
    if (kind === "pick-up") announce("Picked up. The Request is now In progress.", { key: "row-change" })
    const describe = (message: string, thrown: boolean) => thrown && networkError ? networkError : message
    // #260: every failure carries Try again, which runs the whole move again (its toast, its announcement).
    const failed = (message: string, { thrown, offline }: { thrown: boolean; offline: boolean }) =>
      failureToast(offline ? message : describe(message, thrown), { offline, retry: () => start(request, kind, { networkError, assignee }) })
    const outcome = optimistic({
      id: request.id,
      patch: kind === "done" ? { kind: "done", status: "done" }
        : { kind: "pick-up", status: "in_progress", ...(assignee ? { assignedTo: assignee.id, assigneeName: assignee.name, assigneeAvatarUrl: null } : {}) },
      run: () => (kind === "done" ? actions.markDone : actions.pickUpRequest)(request.id, { orgId }),
      waitForPending: true,
      onError: toastId
        ? (message, detail) => { clearMarkedDone(toastId, undoStore); toast({ id: toastId, ...failed(message, detail) }) }
        : networkError ? (message, detail) => { toast(failed(message, detail)) } : undefined,
    }).then(result => {
      // The failure toast speaks for itself; the region drops the claim it made.
      if (result.status === "error" && kind === "pick-up") announce("", { key: "row-change" })
      // #135: once the Done is saved, ask whether the work is live. "Not yet" brings this toast's Undo back.
      if (result.status === "success" && toastId && !undone.has(toastId)) isItLive?.({ id: request.id, name }, {
        reshow: () => { showMarkedDone(toast, request, undo, undoStore, toastId) },
        end: () => {
          clearMarkedDone(toastId, undoStore)
          toast({ id: toastId, type: "success", title: "Release recorded", description: `${name} is now Measuring.`, action: undefined })
        },
      })
      return result
    }).finally(() => { busy.delete(key) })
    afterMove?.(request.id, name)
    return outcome
  }

  // #77: a pick up with an open concern or an unanswered review asks "Pick up anyway?" first.
  // With nothing outstanding the confirmation resolves at once and the move starts before the next paint.
  const move = (request: MoveTarget, kind: LifecycleMove, options?: MoveOptions): Promise<MoveOutcome> => {
    if (kind !== "pick-up" || options?.confirmed) return start(request, kind, options)
    return confirmPickup([request]).then(confirmed => confirmed ? start(request, kind, options) : { status: "cancelled" as const })
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

  return { move, undo, setPriority, copy, confirmPickup }
}

export type RequestMoves = ReturnType<typeof createRequestMoves>
