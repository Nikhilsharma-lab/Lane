"use client"

import { Suspense, createContext, lazy, useContext, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type FocusEvent, type MouseEvent, type PointerEvent } from "react"
import { motion, useIsPresent, useReducedMotion, type Transition } from "motion/react"
import { Button } from "@/components/arc/button/button"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { isShown, isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import type { OverviewRequest } from "@/lib/request-overview"
import { PREFETCH_INTENT_MS, useIntentPrefetch } from "./use-intent-prefetch"
import styles from "./request-peek.module.css"

/** Who is reading, from the list page's own render: the pane names them on Pick up and on a posted comment. */
/** Who is reading the preview. `readOnly` is a Viewer (#210), offered nothing that changes the Request. */
export type PeekViewer = { id: string; name: string; isAdmin: boolean; readOnly?: boolean }

/** Plan item 2.12: the content, the Request detail pane and its islands, is its own chunk, fetched
 * once a row takes focus so the first Space rarely waits. The panel itself loads with the list. */
export const preloadRequestPeek = () => { void import("./request-peek-content").catch(() => undefined) }

/** Phones keep full-page navigation; the preview needs a fine pointer and room beside the list. */
const AVAILABLE = "(min-width: 768px) and (pointer: fine)"
function subscribeAvailable(listener: () => void) {
  const query = window.matchMedia(AVAILABLE)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
export function usePeekAvailable() {
  return useSyncExternalStore(subscribeAvailable, () => window.matchMedia(AVAILABLE).matches, () => false)
}

/** The row menu's Preview: opens the preview on that Request. Null where the preview is not available. */
export const RequestPeekOpener = createContext<((id: string) => void) | null>(null)
export const useRequestPeekOpener = () => useContext(RequestPeekOpener)

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

export type RequestPeekProps = {
  requestId: string
  /** The list's server row for this Request (before the overlay): its moves and priority keep the preview level with the row. */
  serverRow: OverviewRequest | null
  orgId: string
  isGuest: boolean
  viewer: PeekViewer
  /** Esc and Close preview. The list puts focus back on the row. */
  onClose: () => void
  /** Open full page: the list records its order, as Enter on the row does. */
  onOpenFullPage: (event: MouseEvent<HTMLAnchorElement>) => void
}

// A chunk that fails to load (an old tab after a deploy, or offline) says so in the panel, never in place of the list.
const RequestPeekContent = lazy(() => import("./request-peek-content").then(module => ({ default: module.RequestPeekContent }), () => ({ default: PreviewFailed })))

/** Until the content's chunk arrives (it is fetched once a row takes focus, so rarely): the panel's
 * place and its way out. The content renders the full skeleton while it reads the Request. */
function PreviewLoading({ onClose }: { onClose: () => void }) {
  return <div className={styles.state} aria-busy="true" aria-label="Loading Request preview" role="status">
    <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close preview</Button>
  </div>
}

function PreviewFailed({ onClose }: { onClose: () => void }) {
  return <div className={styles.state} role="alert">
    <p>The preview could not load. Reload the page to try again.</p>
    <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close preview</Button>
  </div>
}

// Plan §2.3: the panel moves on transform only, entering in 240 ms on the enter curve and leaving in
// 180 ms on the exit curve, like the list summary and every Arc Dialog. Reduced motion fades instead.
const enter: Transition = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] as [number, number, number, number] }
const leave: Transition = { duration: motionTokens.duration.exit, ease: [...motionTokens.ease.exit] as [number, number, number, number] }

/**
 * Plan item 2.12: a Request beside the list, without leaving it. Not a
 * dialog: the list keeps its keys, so J and K move the list and the preview
 * follows, and focus stays where the person left it. Esc closes it (after any
 * menu or dialog inside it, and never while typing); the list then focuses
 * the Request's row. The full page at /requests/[id] stays one action away.
 */
export function RequestPeek(props: RequestPeekProps) {
  const { requestId, onClose } = props
  const reduced = !!useReducedMotion()
  const present = useIsPresent()
  const panel = useRef<HTMLElement>(null)

  // Capture, so the first Esc closes the preview before the list's own Esc clears the selection.
  const escape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || isTypingTarget(event.target) || overlayOpen()) return
    // Workspace search hides the page; Esc then belongs to the search pane.
    if (!isShown(panel.current)) return
    event.preventDefault()
    onClose()
  })
  useEffect(() => {
    if (!present) return
    const listener = (event: KeyboardEvent) => escape(event)
    window.addEventListener("keydown", listener, true)
    return () => window.removeEventListener("keydown", listener, true)
  }, [present])

  return <motion.div className={styles.viewport} inert={!present} aria-hidden={!present || undefined}>
    <motion.section ref={panel} className={styles.panel} role="region" aria-label="Request preview" data-request-peek="" data-request-id={requestId}
      initial={reduced ? { opacity: 0 } : { x: "104%" }} animate={{ x: "0%", opacity: 1 }} exit={reduced ? { opacity: 0 } : { x: "104%", transition: leave }}
      transition={reduced ? { duration: motionTokens.duration.instant } : enter}>
      {/* Until the chunk arrives the panel shows the skeleton, never an empty frame. */}
      <Suspense fallback={<PreviewLoading onClose={onClose} />}><RequestPeekContent key={requestId} {...props} /></Suspense>
    </motion.section>
  </motion.div>
}
