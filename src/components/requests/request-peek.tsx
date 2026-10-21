"use client"

import { Suspense, createContext, lazy, useContext, useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react"
import { motion, useIsPresent, useReducedMotion, type Transition } from "motion/react"
import { X } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { PageStrip, PageStripProvider } from "@/components/shell/page-strip"
import { isShown, isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import type { OverviewRequest } from "@/lib/request-overview"
import detailStyles from "./detail.module.css"
import styles from "./request-peek.module.css"

/** Plan item 2.12: phones keep full-page navigation; the preview needs a fine pointer and room beside the list. */
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

/** Who is reading, from the list page's own render: the pane names them on Pick up and on a posted comment. */
export type PeekViewer = { id: string; name: string; isAdmin: boolean }

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
  onOpenFullPage: () => void
}

/** Plan item 2.12: the preview's on-demand part, the Request detail pane and its islands. The
 * list's first load carries only this shell. */
const loadContent = () => import("./request-peek-content")
/** Fetches the preview's code ahead of the first Space, so the panel opens on content, not a skeleton. */
export const preloadRequestPeek = () => { void loadContent().catch(() => undefined) }
const RequestPeekContent = lazy(() => loadContent().then(module => ({ default: module.RequestPeekContent })))

/** The shell's trail and sidebar control belong to the page's strip, not the preview's. */
const PREVIEW_FRAME = { trail: [], expand: null, link: "a" as const }
export function PreviewFrame({ children }: { children: React.ReactNode }) {
  return <PageStripProvider value={PREVIEW_FRAME}>{children}</PageStripProvider>
}

export function PreviewClose({ onClose }: { onClose: () => void }) {
  return <Tooltip morph="plain" side="bottom" content={<>Close preview<kbd className={styles.kbd}>Esc</kbd></>}>
    <Button type="button" variant="ghost" size="sm" morph="plain" className={detailStyles.iconButton} aria-label="Close preview" onClick={onClose} data-request-peek-close="">
      <X strokeWidth={1.75} aria-hidden="true" />
    </Button>
  </Tooltip>
}

/** The loaded preview's boxes while its code or its Request loads. Close is there from the first frame. */
export function PreviewSkeleton({ onClose }: { onClose: () => void }) {
  return <section className={detailStyles.root} aria-busy="true" data-skeleton="request-preview">
    <PreviewFrame><PageStrip leading={<PreviewClose onClose={onClose} />} title={<span aria-hidden="true" className="block w-16"><Skeleton lines={1} /></span>} /></PreviewFrame>
    <div className={styles.skeleton}>
      <div className={styles.skeletonTitle}><Skeleton label="Loading Request preview" lines={1} /></div>
      <div aria-hidden="true" className={styles.skeleton}><Skeleton lines={3} /><Skeleton lines={4} /></div>
    </div>
  </section>
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
      <Suspense fallback={<PreviewSkeleton onClose={onClose} />}><RequestPeekContent key={requestId} {...props} /></Suspense>
    </motion.section>
  </motion.div>
}
