"use client"

import { Suspense, createContext, lazy, useContext, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ComponentType, type MouseEvent } from "react"
import { motion, useIsPresent, useReducedMotion, type Transition } from "motion/react"
import { Button } from "@/components/arc/button/button"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { isShown, isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import type { OverviewRequest } from "@/lib/request-overview"
import styles from "./request-peek.module.css"

/** Who is reading, from the list page's own render: the pane names them on Pick up and on a posted comment. */
/** Who is reading the preview. `readOnly` is a Viewer (#210), offered nothing that changes the Request. */
export type PeekViewer = { id: string; name: string; isAdmin: boolean; readOnly?: boolean }

/** Plan item 2.12: the content, the Request detail pane and its islands, is its own chunk, fetched
 * once a row takes focus so the first Space rarely waits. The panel itself loads with the list.
 * #259: with it, the code the content loads on first show (the Iterations list), so the first opening fetches none. */
export const preloadRequestPeek = () => { void import("./request-peek-content").then(module => { loadedContent = module.RequestPeekContent; module.preloadSameProblemView() }, () => undefined) }
/** #259: the content once its code has arrived. A preview opened after that renders it directly: through lazy() it
 * would wait a turn on the arrived code and show the panel's loading state, and React holds a reveal after a loading
 * state for 300 ms. */
let loadedContent: ComponentType<RequestPeekProps> | undefined

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
const LazyContent = lazy(() => import("./request-peek-content").then(module => ({ default: loadedContent = module.RequestPeekContent }), () => ({ default: PreviewFailed })))

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
  // Chosen once for this panel, so the content never remounts when its code arrives.
  const [Content] = useState(() => loadedContent ?? LazyContent)

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
      <Suspense fallback={<PreviewLoading onClose={onClose} />}><Content key={requestId} {...props} /></Suspense>
    </motion.section>
  </motion.div>
}
