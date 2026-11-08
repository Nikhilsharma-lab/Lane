"use client"

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { afterPageLoad } from "@/lib/after-page-load"
import { useServerRefresh } from "./use-optimistic-action"

type Motion = typeof import("./list-motion")
let motion: Motion | null = null

/**
 * #275: the list's feel (list-motion.ts): rows that slide into place, the scroll position kept for Back (A232) and
 * fresh rows on coming back to the tab. Its code loads once the page has loaded and is idle (after-page-load.ts), so
 * the list's first load holds only this hook; until then the list works as before. `rows` changes when the grid's
 * rows do, `still` when the list itself does (nothing slides), `href` is the list's address, `scope` its workspace
 * and person, and `hold` is true while a change is unconfirmed.
 */
export function useListFeel(gridRef: RefObject<HTMLElement | null>, scrollRef: RefObject<HTMLElement | null>, { rows, still, href, scope, hold }: { rows: unknown; still: string; href: string; scope: string; hold: boolean }) {
  const [code, setCode] = useState(motion)
  useEffect(() => code ? undefined : afterPageLoad(() => { void import("./list-motion").then(module => setCode(motion = module)) }), [code])
  const [moves] = useState(() => ({ running: new Set<Animation>() }))
  useLayoutEffect(() => { code?.moveRows(gridRef.current, still, moves) }, [code, gridRef, moves, rows, still])
  const address = useRef(href)
  const place = useRef<ReturnType<Motion["keepPlace"]> | null>(null)
  useLayoutEffect(() => {
    if (!code || !scrollRef.current) return
    const kept = place.current = code.keepPlace(scrollRef.current, scope, () => address.current)
    return kept.stop
  }, [code, scope, scrollRef])
  // A new address keeps the position it has now, so a fold or Show more before opening a Request is remembered too.
  useLayoutEffect(() => {
    if (address.current === href) return
    address.current = href
    place.current?.moved()
  }, [href])
  const refresh = useServerRefresh()
  const onReturn = useEffectEvent(() => { if (!hold) refresh() })
  useEffect(() => code?.refreshOnReturn(onReturn), [code])
}
