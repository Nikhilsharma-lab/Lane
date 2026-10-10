"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { OverviewRequest } from "@/lib/request-overview"

/** The fields a pending lifecycle or priority move can change on a row. */
export type RequestPatch = Partial<Pick<OverviewRequest, "status" | "priority" | "assignedTo" | "assigneeName" | "assigneeAvatarUrl">> & {
  kind: "pick-up" | "done" | "undo" | "priority"
  /** performance.now() when the patch was applied; the no-revert gate reads it. */
  since: number
}

export type PendingMutations = {
  /** Patches keyed by Request id, applied on top of whatever the server rendered. */
  patches: Record<string, RequestPatch>
  /** Returns the rows with every pending patch applied; identity is preserved for untouched rows. */
  apply<T extends { id: string }>(rows: T[]): T[]
}

/**
 * One pending-mutation overlay at layout level (plan item 1.5). The list,
 * detail, summary, counts and the composer insert read through it, so a
 * change shows in the next frame and never visibly reverts: a patch clears
 * only when the server rows show it or when the action fails.
 *
 * This file starts as the API contract; the implementation lands with the
 * mutation helper (useOptimisticAction).
 */
const PendingMutationsContext = createContext<PendingMutations | null>(null)

export function PendingMutationsProvider({ children }: { children: ReactNode }) {
  const value: PendingMutations = { patches: {}, apply: rows => rows }
  return <PendingMutationsContext.Provider value={value}>{children}</PendingMutationsContext.Provider>
}

/** Null outside the provider (older fixtures); consumers fall back to the server rows. */
export const usePendingMutations = () => useContext(PendingMutationsContext)
