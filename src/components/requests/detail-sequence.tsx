"use client"

import { useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { isShown, overlayOpen } from "@/lib/keyboard-guards"
import { requestDetailHref } from "@/lib/request-workspace"
import { useListAnnouncer } from "./list-announcer"
import { detailCommand, isTypingTarget } from "./request-detail-keys"
import { useDetailSession } from "./list-view-state"
import { useRequestNavigation } from "./request-navigation"
import { advanceSequence, sequencePosition, type SequencePosition } from "./request-sequence"
import { FULL_PREFETCH, useIntentPrefetch } from "./use-intent-prefetch"
import styles from "./detail.module.css"

export type SequenceDirection = "previous" | "next"

/**
 * Plan item 2.5: where this Request sits in the list it was opened from, and
 * the way to its neighbours. `go` replaces the history entry (decision D4),
 * so Back and Esc both return to the list in one step and the list focuses
 * the last Request viewed. Null position: no sequence (a deep link, a reload,
 * an arrival from search), so nothing renders. The page being left keeps its
 * position until the next one arrives, so its counter and a focused previous
 * or next button do not disappear while the navigation is pending.
 */
export function useDetailSequence(requestId: string) {
  const navigation = useRequestNavigation()
  const { sequence } = useDetailSession()
  const position = sequencePosition(sequence, requestId)
  const go = useCallback((direction: SequenceDirection, { keepFocusOnButton = false }: { keepFocusOnButton?: boolean } = {}) => {
    const target = direction === "next" ? position?.nextId : position?.previousId
    if (!sequence || !target) return false
    navigation.replaceDetail(target, { sequence: advanceSequence(sequence, target, requestId), button: keepFocusOnButton ? direction : null })
    return true
  }, [position?.nextId, position?.previousId, requestId, navigation, sequence])
  return { position, go }
}

/** Both neighbours, fully prefetched once the page is idle: at most two per detail view (plan item 2.5). */
function useNeighbourPrefetch(position: SequencePosition | null) {
  const router = useRouter()
  const nextId = position?.nextId, previousId = position?.previousId
  useEffect(() => {
    const hrefs = [nextId, previousId].filter((id): id is string => Boolean(id)).map(id => requestDetailHref(id, "all"))
    if (!hrefs.length) return
    const run = () => { for (const href of hrefs) router.prefetch(href, FULL_PREFETCH) }
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 2000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(run, 200)
    return () => window.clearTimeout(timer)
  }, [nextId, previousId, router])
}

/**
 * J and K anywhere on detail; the arrows only from the previous and next
 * buttons, where focus then stays on the matching button on the new page.
 * At either end nothing moves and the polite region says so. Nothing runs
 * while a dialog, menu or listbox is open, while search hides the page, or
 * while a section form is open or holds focus: leaving would drop its unsaved
 * link, question or reviewers (Esc closes the form first).
 */
function useSequenceKeys(position: SequencePosition | null, go: ReturnType<typeof useDetailSequence>["go"]) {
  const announce = useListAnnouncer()
  useEffect(() => {
    if (!position) return
    function onKeyDown(event: KeyboardEvent) {
      if (overlayOpen() || !isShown(document.querySelector("[data-detail]"))) return
      if (document.querySelector("[data-detail] [data-detail-form]") || (event.target instanceof Element && event.target.closest("[data-detail] form"))) return
      const onNavButtons = event.target instanceof Element && event.target.closest("[data-detail-sequence]") !== null
      const command = detailCommand(event, isTypingTarget(event.target), onNavButtons)
      if (!command) return
      event.preventDefault()
      if (!go(command, { keepFocusOnButton: onNavButtons })) announce(command === "next" ? "Last Request in the list." : "First Request in the list.", { key: "sequence" })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [announce, go, position])
}

function SequenceButton({ direction, targetId, onGo }: { direction: SequenceDirection; targetId: string | null; onGo: (direction: SequenceDirection) => void }) {
  const href = targetId ? requestDetailHref(targetId, "all") : ""
  const prefetch = useIntentPrefetch(href)
  const label = direction === "next" ? "Next Request" : "Previous Request"
  const Icon = direction === "next" ? ChevronDown : ChevronUp
  return <Tooltip morph="plain" side="bottom" content={<>{label}<kbd className={styles.kbd}>{direction === "next" ? "J" : "K"}</kbd></>}>
    <Button type="button" variant="ghost" size="sm" morph="plain" className={styles.iconButton} aria-label={label} disabled={!targetId}
      data-detail-sequence={direction} data-href={href || undefined}
      onPointerEnter={event => { if (targetId && event.pointerType !== "touch") prefetch.schedule() }}
      onPointerLeave={() => prefetch.cancel()}
      onPointerDown={() => { if (targetId) prefetch.now() }}
      onFocus={() => { if (targetId) prefetch.now() }}
      onClick={() => onGo(direction)}>
      <Icon strokeWidth={1.75} aria-hidden="true" />
    </Button>
  </Tooltip>
}

/** The strip's "2 / 5" with previous and next. Renders nothing without a sequence. */
export function DetailSequence({ requestId }: { requestId: string }) {
  const { position, go } = useDetailSequence(requestId)
  useNeighbourPrefetch(position)
  useSequenceKeys(position, go)
  if (!position) return null
  const { index, total } = position
  return <div role="group" aria-label={`Request ${index + 1} of ${total} in the list`} className={styles.sequence} data-detail-sequence-group="">
    <span aria-hidden="true" className={styles.counter}>{index + 1} / {total}</span>
    <SequenceButton direction="previous" targetId={position.previousId} onGo={direction => go(direction)} />
    <SequenceButton direction="next" targetId={position.nextId} onGo={direction => go(direction)} />
  </div>
}
