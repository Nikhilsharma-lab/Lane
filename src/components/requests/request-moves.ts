"use client"

import { useCallback, useRef } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import { REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants"
import type { LifecycleMove } from "@/lib/request-lifecycle"
import type { ReviewState } from "@/lib/request-reviewer-rules"
import { requestCodeOrNull } from "./detail-context"
import { usePickupConfirmation } from "./pickup-confirmation"
import type { Announce } from "./list-announcer"
import { useCopy } from "./use-copy"
import { FAILURE_TITLE, useOptimisticAction, type OptimisticOutcome } from "./use-optimistic-action"

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

type MoveOutcome = OptimisticOutcome<unknown> | { status: "busy" } | { status: "cancelled" }

/**
 * Plan item 2.5: the list's Request moves, extracted from request-row-actions.tsx
 * so Request detail runs the same ones with the same copy. Every move goes
 * through the pending-mutation overlay (plan item 1.5): Pick up is said in the
 * polite region in the same frame, Mark Done confirms at once in a toast that
 * carries Undo, and a failure replaces that toast or raises its own.
 * `afterMove` runs once a move has started (the list keeps focus on the
 * moved row) and after an Undo succeeds.
 */
export function useRequestMoves({ orgId, announce, afterMove }: {
  orgId: string
  announce: Announce
  afterMove?: (id: string, name: string) => void
}) {
  const { toast, update } = useToastStack()
  const optimistic = useOptimisticAction()
  const busy = useRef(new Set<string>())
  const confirmPickup = usePickupConfirmation()

  // Results reuse the toast's id: an update if it is still showing, a fresh toast if it was dismissed meanwhile.
  // Undo is sent only after the Done move it reverses has succeeded.
  const undo = useCallback(async (toastId: string, requestId: string, name: string) => {
    update(toastId, { type: "loading", title: "Undoing", description: `${name} is moving back to In Progress.`, action: undefined })
    const outcome = await optimistic({
      id: requestId,
      patch: { kind: "undo", status: "in_progress" },
      run: () => undoMarkDone(requestId, { orgId }),
      waitForPending: true,
      onError: description => { toast({ id: toastId, type: "error", title: "Could not undo", description }) },
    })
    if (outcome.status !== "success") return
    toast({ id: toastId, type: "success", title: "Back In Progress", description: `${name} is In Progress again.` })
    afterMove?.(requestId, name)
  }, [afterMove, optimistic, orgId, toast, update])

  /** One toast per move: Done confirms at once with Undo, and a failure replaces that same toast. */
  const start = useCallback((request: MoveTarget, kind: LifecycleMove, { networkError, assignee }: MoveOptions = {}): Promise<MoveOutcome> => {
    const key = `${request.id}:${kind}`
    if (busy.current.has(key)) return Promise.resolve({ status: "busy" })
    busy.current.add(key)
    const { name } = request
    const toastId = kind === "done"
      // Done leaves the working views, so its confirmation carries the way back.
      ? toast({ type: "success", title: "Marked Done", description: `${name} is now Done.`, duration: 10_000,
        action: { label: "Undo", onClick: id => void undo(id, request.id, name) } })
      : null
    // Done is acknowledged by its toast; a pick up is acknowledged here, in the same frame as the move.
    if (kind === "pick-up") announce("Picked up. The Request is now In Progress.", { key: "row-change" })
    const describe = (message: string, thrown: boolean) => thrown && networkError ? networkError : message
    const outcome = optimistic({
      id: request.id,
      patch: kind === "done" ? { kind: "done", status: "done" }
        : { kind: "pick-up", status: "in_progress", ...(assignee ? { assignedTo: assignee.id, assigneeName: assignee.name, assigneeAvatarUrl: null } : {}) },
      run: () => (kind === "done" ? markDone : pickUpRequest)(request.id, { orgId }),
      waitForPending: true,
      onError: toastId
        ? (message, { thrown }) => { toast({ id: toastId, type: "error", title: FAILURE_TITLE, description: describe(message, thrown), action: undefined }) }
        : networkError ? (message, { thrown }) => { toast({ type: "error", title: FAILURE_TITLE, description: describe(message, thrown) }) } : undefined,
    }).then(result => {
      // The failure toast speaks for itself; the region drops the claim it made.
      if (result.status === "error" && kind === "pick-up") announce("", { key: "row-change" })
      return result
    }).finally(() => { busy.current.delete(key) })
    afterMove?.(request.id, name)
    return outcome
  }, [afterMove, announce, optimistic, orgId, toast, undo])

  // #77: a pick up with an open concern or an unanswered review asks "Pick up anyway?" first.
  // With nothing outstanding the confirmation resolves at once and the move starts before the next paint.
  const move = useCallback((request: MoveTarget, kind: LifecycleMove, options?: MoveOptions): Promise<MoveOutcome> => {
    if (kind !== "pick-up" || options?.confirmed) return start(request, kind, options)
    return confirmPickup([request]).then(confirmed => confirmed ? start(request, kind, options) : { status: "cancelled" as const })
  }, [confirmPickup, start])

  const setPriority = useCallback((requestId: string, priority: RequestPriority) => {
    announce(`Priority set to ${REQUEST_PRIORITY_LABELS[priority].toLowerCase()}.`, { key: "row-change" })
    return optimistic({
      id: requestId,
      patch: { kind: "priority", priority },
      run: () => setRequestPriority(requestId, priority, { orgId }),
    }).then(outcome => {
      if (outcome.status === "error") announce("", { key: "row-change" })
      return outcome
    })
  }, [announce, optimistic, orgId])

  const copyText = useCopy()
  const copy = useCallback((value: string, label: string) => copyText(value, `${label} copied.`), [copyText])

  return { move, undo, setPriority, copy, confirmPickup }
}
