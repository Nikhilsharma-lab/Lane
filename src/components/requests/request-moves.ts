"use client"

import { useMemo, useState } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDone, markDoneMany, pickUpRequest, pickUpRequests, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import { useIsItLive } from "./is-it-live-prompt"
import type { Announce } from "./list-announcer"
import { usePickupConfirmation } from "./pickup-confirmation"
import { useRequestNavigation } from "./request-navigation"
import { createRequestMoves, type RequestMoveActions } from "./request-moves-controller"
import { useCopy } from "./use-copy"
import { useOptimisticAction, useOptimisticBatch, useServerRefresh } from "./use-optimistic-action"

export { moveTarget, type MoveOptions, type MoveOutcome, type MoveTarget } from "./request-moves-controller"

// Each action is looked up when a move runs, as the hook's callbacks always did.
const actions: RequestMoveActions = {
  markDone: (...args) => markDone(...args),
  pickUpRequest: (...args) => pickUpRequest(...args),
  setRequestPriority: (...args) => setRequestPriority(...args),
  undoMarkDone: (...args) => undoMarkDone(...args),
  pickUpRequests: (...args) => pickUpRequests(...args),
  markDoneMany: (...args) => markDoneMany(...args),
}

/** The Request moves (request-moves-controller.ts) bound to the app's toasts, overlay, pickup confirmation, clipboard and server actions. */
export function useRequestMoves({ orgId, announce, afterMove }: {
  orgId: string
  announce: Announce
  afterMove?: (id: string, name: string) => void
}) {
  const { toast, update } = useToastStack()
  const optimistic = useOptimisticAction()
  const optimisticBatch = useOptimisticBatch()
  const refresh = useServerRefresh()
  // Moves in flight, kept across renders so a second Enter on the same move is refused.
  const [busy] = useState(() => new Set<string>())
  const confirmPickup = usePickupConfirmation()
  const { continuation } = useRequestNavigation()
  const copyText = useCopy()
  // #135: a successful Mark Done asks "Is it live?".
  const isItLive = useIsItLive()
  return useMemo(() => createRequestMoves({ orgId, announce, afterMove, toast, update, optimistic, optimisticBatch, refresh, confirmPickup, continuation, copyText, actions, busy, isItLive }),
    [afterMove, announce, busy, confirmPickup, continuation, copyText, isItLive, optimistic, optimisticBatch, orgId, refresh, toast, update])
}
