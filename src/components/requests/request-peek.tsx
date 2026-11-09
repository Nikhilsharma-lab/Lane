"use client"

import { Suspense, createContext, lazy, useContext, useEffect, useEffectEvent, useRef, useState, type ComponentType, type MouseEvent } from "react"
import { m, useIsPresent, useReducedMotion, type Transition } from "motion/react"
import { Button } from "@/components/arc/button/button"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { isShown, isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import { dismissOpenForm } from "@/components/popup/dismiss-form"
import { useMediaQuery } from "@/lib/use-media-query"
import type { OverviewRequest } from "@/lib/request-overview"
import styles from "./request-peek.module.css"
import { RequestPeekSkeleton } from "./request-peek-skeleton"

/** Who is reading, from the list page's own render: the pane names them on Pick up and on a posted comment. */
/** Who is reading the preview. `readOnly` is a Viewer (#210), offered nothing that changes the Request. */
export type PeekViewer = { id: string; name: string; isAdmin: boolean; readOnly?: boolean }

/** Plan item 2.12: the content, the Request detail pane and its islands, is its own chunk, fetched
 * once a row takes focus so the first Space rarely waits. The panel itself loads with the list.
 * #259: with it, the code the content loads on first show (the Iterations list), so the first opening fetches none. */
export const preloadRequestPeek = () => { void loadContent().catch(() => undefined) }
/** #259: the content once its code has arrived. A preview opened after that renders it directly: through lazy() it
 * would wait a turn on the arrived code and show the panel's loading state, and React holds a reveal after a loading
 * state for 300 ms. */
let loadedContent: ComponentType<RequestPeekProps> | undefined
const loadContent = () => import("./request-peek-content").then(module => { module.preloadSameProblemView(); return { default: loadedContent = module.RequestPeekContent } })

/** #240 decision 2: the preview is offered at 1280px and wider with a mouse. Narrower windows, phones and touch
 * screens open the Request's own page. The list and the Inbox read the same rule. */
export const usePeekAvailable = () => useMediaQuery("(min-width: 1280px) and (pointer: fine)")

/** The row menu's Preview: opens the preview on that Request. Null where the preview is not available. */
export const RequestPeekOpener = createContext<((id: string) => void) | null>(null)
export const useRequestPeekOpener = () => useContext(RequestPeekOpener)
/** Page-quality 2.12: the previewed row's `aria-controls`. One preview per page (the list's or the Inbox's). */
export const REQUEST_PREVIEW_ID = "request-preview"

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
const LazyContent = lazy(() => loadContent().catch(() => ({ default: PreviewFailed })))

// #240: the polish bar's panel motion, 0.2s in and 0.15s out, on transform only. Under reduced motion it neither
// moves nor fades. Replacing the Request (J and K) keeps the panel, so only opening and closing move.
const enter: Transition = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] as [number, number, number, number] }
const leave: Transition = { duration: motionTokens.duration.exit, ease: [...motionTokens.ease.exit] as [number, number, number, number] }
/** The slide of a panel beside the list: the preview's, and the summary's (request-list-summary.tsx). */
export const panelSlide = (reduced: boolean) => ({ initial: reduced ? false as const : { x: "100%" }, animate: { x: "0%" }, exit: reduced ? undefined : { x: "100%", transition: leave }, transition: enter })

function PreviewFailed({ onClose }: { onClose: () => void }) {
  return <div className={styles.state} role="alert">
    <p>The preview couldn’t load. Reload the page to try again.</p>
    <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close preview</Button>
  </div>
}

/**
 * Plan item 2.12: a Request beside the list, without leaving it. Not a
 * dialog: the list keeps its keys, so J and K move the list and the preview
 * follows, and focus stays where the person left it. Esc closes it (after any
 * menu or dialog inside it, and never while typing); the list then focuses
 * the Request's row. The full page at /requests/[id] stays one action away.
 */
export function RequestPeek(props: RequestPeekProps) {
  const { requestId, onClose } = props
  const present = useIsPresent()
  const reduced = !!useReducedMotion()
  const panel = useRef<HTMLElement>(null)
  // Chosen once for this panel, so the content never remounts when its code arrives.
  const [Content] = useState(() => loadedContent ?? LazyContent)

  // Capture, so the first Esc closes the preview before the list's own Esc clears the selection.
  const escape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || isTypingTarget(event.target) || overlayOpen()) return
    // Workspace search hides the page; Esc then belongs to the search pane.
    if (!isShown(panel.current)) return
    event.preventDefault()
    // #263: an open form in the preview closes first (asking if it holds typed text); the preview stays.
    if (panel.current && dismissOpenForm(panel.current)) return
    onClose()
  })
  useEffect(() => {
    if (!present) return
    const listener = (event: KeyboardEvent) => escape(event)
    window.addEventListener("keydown", listener, true)
    return () => window.removeEventListener("keydown", listener, true)
  }, [present])

  // Leaving, the panel gives its column back at once and slides out over the list's edge (request-peek.module.css).
  return <div className={styles.viewport} inert={!present} aria-hidden={!present || undefined} data-leaving={!present || undefined}>
    <m.section ref={panel} id={REQUEST_PREVIEW_ID} className={styles.panel} role="region" aria-label="Request preview" data-request-peek="" data-request-id={requestId}
      {...panelSlide(reduced)}>
      {/* Until the chunk arrives (it is fetched once a row takes focus, so rarely) the pane shows the content's own
          skeleton, with Close, from its first frame: never an empty frame or a bare button (#271, A116). */}
      <Suspense fallback={<RequestPeekSkeleton onClose={onClose} />}><Content key={requestId} {...props} /></Suspense>
    </m.section>
  </div>
}
