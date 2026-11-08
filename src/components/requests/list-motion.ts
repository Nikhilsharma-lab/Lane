import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { prefersReducedMotion } from "@/components/motion/reduced-motion"

/**
 * #275: the list's feel, loaded after the page (list-feel.ts), so none of it is in the list's first load. Rows slide
 * into place (#230 idea 8), the list keeps its scroll position (A232) and coming back to the tab reads fresh rows
 * (#230 idea 9).
 */

const timing = (ease: readonly number[]) => ({ duration: motionTokens.duration.standard * 1000, easing: `cubic-bezier(${ease.join(", ")})` })
const MOVE = timing(motionTokens.ease.inOut), APPEAR = timing(motionTokens.ease.enter)
/** More moves than this at once is a new list, not a change in this one: it shows at once. */
const MOST_MOVES = 120
/** A restore waits this many frames at most for the rows to reach the remembered position. */
const RESTORE_FRAMES = 10
/** Focus and visibility arrive together when a person comes back to the tab: one read covers both. */
const SAME_RETURN_MS = 1000

/** Where each list was last scrolled, by workspace and person: memory only, so a reload or sign-out drops it. */
const places = new Map<string, { href: string; top: number }>()

export type RowMoves = { still?: string; tops?: Map<string, number>; running: Set<Animation> }

/**
 * Called after each commit that changed the grid's rows. Each grid row that stays slides from where it was to where
 * it is, and a row that appears fades in, on Build 2's standard 0.2s (Web Animations, so the memoised rows stay plain
 * elements). Nothing moves under reduced motion, or when `still` changed: a new filter, order, grouping or Show more
 * is a different list, shown at once.
 */
export function moveRows(grid: HTMLElement | null, still: string, moves: RowMoves) {
  // Unfinished moves would skew where each row is now.
  for (const animation of moves.running) animation.cancel()
  moves.running.clear()
  const previous = moves.still === still ? moves.tops : undefined
  moves.still = still
  moves.tops = undefined
  if (!grid) return
  const origin = grid.getBoundingClientRect().top
  const tops = moves.tops = new Map<string, number>()
  const changes: [HTMLElement, Keyframe[], object][] = []
  for (const element of grid.querySelectorAll<HTMLElement>("[data-grid-row]")) {
    if (!element.getClientRects().length) continue
    const key = element.dataset.gridRow!, top = element.getBoundingClientRect().top - origin, from = previous?.get(key)
    tops.set(key, top)
    if (!previous) continue
    if (from === undefined) changes.push([element, [{ opacity: 0 }, { opacity: 1 }], APPEAR])
    else if (Math.abs(from - top) >= 1) changes.push([element, [{ transform: `translateY(${from - top}px)` }, { transform: "none" }], MOVE])
  }
  if (changes.length > MOST_MOVES || prefersReducedMotion()) return
  for (const [element, keyframes, options] of changes) {
    const animation = element.animate(keyframes, options)
    moves.running.add(animation)
    animation.onfinish = animation.oncancel = () => moves.running.delete(animation)
  }
}

/**
 * Remembers how far the list is scrolled and at which address, for the session (`scope` is the workspace and person);
 * when the list mounts at the address it was last scrolled at (Back from a Request, its back link or Esc, reopening
 * it from another page), puts it there again before the first paint. The returning row's focus then moves nothing
 * (list-focus.ts scrolls a row only to the nearest edge). Another list (a filter, a grouping) starts where it is.
 */
export function keepPlace(element: HTMLElement, scope: string, address: () => string) {
  const remembered = places.get(scope)
  let wanted = remembered?.href === address() && remembered.top > 0 ? remembered.top : null
  let frames = 0, frame = 0
  // Rows that unfold on the way back can make the list tall enough only a frame or two later.
  const restore = () => {
    if (wanted === null) return
    element.scrollTop = wanted
    if (Math.abs(element.scrollTop - wanted) <= 1 || ++frames >= RESTORE_FRAMES) wanted = null
    else frame = requestAnimationFrame(restore)
  }
  restore()
  const remember = () => { if (wanted === null) places.set(scope, { href: address(), top: element.scrollTop }) }
  element.addEventListener("scroll", remember, { passive: true })
  return { moved: remember, stop: () => { cancelAnimationFrame(frame); element.removeEventListener("scroll", remember) } }
}

/**
 * The tab becoming visible, or the window taking focus, reads the list again through the one server refresh, as
 * Inbox re-reads its list (decision 8.15). `refresh` does nothing offline, or while a change is unconfirmed (its own
 * response brings the fresh rows); pending optimistic changes apply over whatever rows arrive, so they stay shown.
 */
export function refreshOnReturn(refresh: () => void) {
  let last = 0
  const read = () => { if (document.visibilityState !== "visible" || Date.now() - last < SAME_RETURN_MS) return; last = Date.now(); refresh() }
  window.addEventListener("focus", read)
  document.addEventListener("visibilitychange", read)
  return () => { window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", read) }
}
