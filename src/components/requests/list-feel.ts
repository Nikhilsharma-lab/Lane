"use client"

import { useEffect, useLayoutEffect, useState, type RefObject } from "react"
import { afterPageLoad } from "@/lib/after-page-load"
import { useServerRefresh } from "./use-optimistic-action"
import type { OlderFill } from "./list-fill"
import type { ListGroup } from "./list-view-model"

let motion: typeof import("./list-motion") | null = null

export type ListFeelInput = {
  grid: RefObject<HTMLElement | null>
  scroller: RefObject<HTMLElement | null>
  /** The grid's rows: each change is a commit whose rows slide. */
  rows: readonly string[]
  /** Changes when the list itself does (a filter, order, grouping or Show more), so nothing slides. */
  still: string
  href: string
  /** The workspace and person whose scroll position is kept; null (no workspace) keeps none. */
  scope: string | null
  /** A change is unconfirmed: no refresh on the tab's return. */
  hold: boolean
  /** A212: the groups, the count each should show and the older reads that fill them (none without a workspace). */
  groups: ListGroup[]
  shownCounts: Record<string, number>
  older?: OlderFill
}

/** #275: loads list-motion.ts after the page and runs it; its notes say what each part does and why. */
export function useListFeel({ grid, scroller, rows, still, href, scope, hold, groups, shownCounts, older }: ListFeelInput) {
  const [code, setCode] = useState(motion)
  useEffect(() => code ? undefined : afterPageLoad(() => { void import("./list-motion").then(module => setCode(motion = module)) }), [code])
  const refresh = useServerRefresh()
  const [feel] = useState(() => ({ running: new Set<Animation>(), href }))
  useLayoutEffect(() => { code?.commit(feel, grid.current, still, href, hold, refresh) }, [code, feel, grid, rows, still, href, hold, refresh])
  useLayoutEffect(() => code?.mount(feel, scroller.current, scope), [code, feel, scroller, scope])
  useEffect(() => { if (older) code?.fillGroups(groups, shownCounts, older) }, [code, groups, shownCounts, older])
}
