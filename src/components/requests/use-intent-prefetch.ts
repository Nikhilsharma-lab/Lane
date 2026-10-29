"use client"

import { useEffect, useMemo, useRef } from "react"
import { useStableRouter } from "@/components/shell/stable-router"
import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"

/** How long the pointer must rest on a title before the full detail route is prefetched. */
export const PREFETCH_INTENT_MS = 80
// PrefetchKind is a type-only enum in Next; "full" fetches the whole page,
// not just the loading skeleton the viewport prefetch fetches.
export const FULL_PREFETCH = { kind: "full" as PrefetchKind }

/**
 * A full router.prefetch of a Request's detail on intent: `now` at once,
 * `schedule` after the person rests for PREFETCH_INTENT_MS, `cancel` when they
 * move on. One href is fetched once per mount. Plan item 2.4: the row uses it
 * on keyboard focus, so holding J past ten rows starts at most one prefetch.
 * Plan item 2.5: detail's previous and next buttons use it too.
 */
export function useIntentPrefetch(href: string) {
  // Every row of the list uses this: a URL change must not re-render them all (#296).
  const router = useStableRouter()
  const timer = useRef<number | undefined>(undefined)
  const prefetched = useRef<string | null>(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return useMemo(() => {
    const now = () => {
      window.clearTimeout(timer.current)
      if (prefetched.current === href) return
      prefetched.current = href
      router.prefetch(href, FULL_PREFETCH)
    }
    return {
      now,
      schedule: () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(now, PREFETCH_INTENT_MS) },
      cancel: () => window.clearTimeout(timer.current),
    }
  }, [href, router])
}
