"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type FocusEvent, type PointerEvent } from "react"
import { preloadRequestPeek } from "./request-peek"
import { PREFETCH_INTENT_MS, useIntentPrefetch } from "./use-intent-prefetch"

/** #258: how a row was rested on: keyboard focus landing on it, or the pointer resting on it. */
export type PeekRest = "focus" | "pointer"
/** #258: reads a Request into the preview's memory before it opens. Null where the preview is not offered. */
export type PeekLoadAhead = (requestId: string, via: PeekRest) => void
export const RequestPeekLoadAhead = createContext<PeekLoadAhead | null>(null)

/**
 * #258: a list's load ahead, for RequestPeekLoadAhead: the preview's code and the Request. Null where the
 * preview is not offered. An open preview reads the Request it shows itself, so focus moving reads nothing
 * more while `previewOpen`; resting the pointer on another row still does. The memory
 * (request-peek-memory.ts) is its own small chunk, shared with the preview's content, so the list's first
 * load does not carry it.
 */
export function useListLoadAhead(orgId: string | undefined, viewerId: string | undefined, { offered, previewOpen }: { offered: boolean; previewOpen: boolean }) {
  const open = useRef(previewOpen)
  useLayoutEffect(() => { open.current = previewOpen })
  return useMemo<PeekLoadAhead | null>(() => !offered || !orgId || !viewerId ? null : (requestId, via) => {
    if (via === "focus" && open.current) return
    preloadRequestPeek()
    void import("./request-peek-memory").then(memory => memory.readAhead(orgId, viewerId, requestId), () => undefined)
  }, [offered, orgId, viewerId])
}

/**
 * #258: a row's rest, as event props: keyboard focus on the row prefetches `href`'s page (plan item 2.4),
 * and focus or the pointer resting on it for PREFETCH_INTENT_MS reads `requestId` into the preview, where
 * the list offers one. Moving on cancels both, so a held J reads only the row it stops on. `focus` goes on
 * the row's tab stop and `pointer` on the whole row; focus moving inside the tab stop is not a rest.
 */
export function useRowLoadAhead(href: string, requestId: string | null | undefined) {
  const prefetch = useIntentPrefetch(href)
  const load = useContext(RequestPeekLoadAhead)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return useMemo(() => {
    const schedule = (via: PeekRest) => {
      window.clearTimeout(timer.current)
      if (load && requestId) timer.current = window.setTimeout(() => load(requestId, via), PREFETCH_INTENT_MS)
    }
    const cancel = () => window.clearTimeout(timer.current)
    return {
      focus: {
        onFocus: (event: FocusEvent) => { if (event.target !== event.currentTarget) return; if (href) prefetch.schedule(); schedule("focus") },
        onBlur: (event: FocusEvent) => { if (event.target !== event.currentTarget) return; prefetch.cancel(); cancel() },
      },
      pointer: {
        onPointerEnter: (event: PointerEvent) => { if (event.pointerType !== "touch") schedule("pointer") },
        onPointerLeave: cancel,
      },
    }
  }, [href, load, prefetch, requestId])
}
