"use client"

import { useCallback, useRef } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import { REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants"
import type { LifecycleMove } from "@/lib/request-lifecycle"
import type { Announce } from "./list-announcer"
import { FAILURE_TITLE, useOptimisticAction, type OptimisticOutcome } from "./use-optimistic-action"

/** The Request a move acts on: its id and the name its toasts use (the saved code, else the title). */
export type MoveTarget = { id: string; name: string }

export type MoveOptions = {
  /** Replaces the failure description when the action threw (a lost response), so the copy can say what to check. */
  networkError?: string
}

type MoveOutcome = OptimisticOutcome<unknown> | { status: "busy" }

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
  const move = useCallback((request: MoveTarget, kind: LifecycleMove, { networkError }: MoveOptions = {}): Promise<MoveOutcome> => {
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
      patch: kind === "done" ? { kind: "done", status: "done" } : { kind: "pick-up", status: "in_progress" },
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

  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      announce(`${label} copied.`, { key: "copy" })
      return true
    } catch {
      toast({ type: "error", title: "Could not copy", description: "Select the text and copy it instead." })
      return false
    }
  }, [announce, toast])

  return { move, undo, setPriority, copy }
}
