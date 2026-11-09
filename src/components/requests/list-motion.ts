import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { prefersReducedMotion } from "@/components/motion/reduced-motion"

/**
 * #275: the list's feel. Rows slide into place, fade out as they leave and fade in as a group unfolds (#230 idea 8,
 * #256 user story 44), the list keeps its scroll position (A232), coming back to the tab reads fresh rows (#230 idea 9)
 * and a group reads the older Requests it should show (list-fill.ts). list-feel.ts, the hook DataTable calls, loads
 * this file once the page has loaded and is idle (after-page-load.ts) and runs it through `commit`, `mount` and
 * `fillGroups`; until then the list works as before. The hook passes the grid's rows, `still` (changes when the list
 * itself does, so nothing slides), the list's address, its workspace and person (`scope`), and whether a change is
 * unconfirmed (no refresh then).
 */
export { fillGroups } from "./list-fill"

const timing = (ease: readonly number[]) => ({ duration: motionTokens.duration.standard * 1000, easing: `cubic-bezier(${ease.join(", ")})` })
const MOVE = timing(motionTokens.ease.inOut), APPEAR = timing(motionTokens.ease.enter), LEAVE = timing(motionTokens.ease.exit)
/** What a row that left keeps for its stand-in, so nothing finds, focuses or reads it while it fades. */
const STRIPPED = ["id", "role", "tabindex", "data-grid-row", "data-request-id", "aria-controls", "aria-labelledby", "aria-describedby"]
/** More moves than this at once is a new list, not a change in this one: it shows at once. */
const MOST_MOVES = 120
/** A restore waits this many frames at most for the rows to reach the remembered position. */
const RESTORE_FRAMES = 10
/** Focus and visibility arrive together when a person comes back to the tab: one read covers both. */
const SAME_RETURN_MS = 1000

/** Where each list was last scrolled, by workspace and person: memory only, so a reload or sign-out drops it. */
const places = new Map<string, { href: string; top: number }>()

/** A shown grid row (a Request, a group's header or its Show more) where the last commit left it, from the grid's corner. */
type Seen = { element: HTMLElement; top: number; left: number; width: number }
export type RowMoves = { still?: string; seen?: Map<string, Seen>; running: Set<Animation> }

/**
 * Called after each commit that changed the grid's rows. Each grid row that stays slides from where it was to where
 * it is, a row that appears (a group unfolding) fades in, and a row that went (it left the list, or its group folded)
 * fades out where it was, through an inert stand-in that goes with the fade. All on Build 2's standard 0.2s (Web
 * Animations, so the memoised rows stay plain elements). Nothing moves under reduced motion, or when `still`
 * changed: a new filter, order, grouping or Show more is a different list, shown at once.
 */
export function moveRows(grid: HTMLElement | null, still: string, moves: RowMoves) {
  // Unfinished moves would skew where each row is now; a stand-in goes with its fade.
  for (const animation of moves.running) animation.cancel()
  moves.running.clear()
  const previous = moves.still === still ? moves.seen : undefined
  moves.still = still
  moves.seen = undefined
  if (!grid) return
  const origin = grid.getBoundingClientRect()
  const seen = moves.seen = new Map<string, Seen>()
  const changes: [HTMLElement, Keyframe[], object][] = []
  for (const element of grid.querySelectorAll<HTMLElement>("[data-grid-row]")) {
    if (!element.getClientRects().length) continue
    const box = element.getBoundingClientRect(), key = element.dataset.gridRow!, top = box.top - origin.top, from = previous?.get(key)
    seen.set(key, { element, top, left: box.left - origin.left, width: box.width })
    if (!previous) continue
    if (!from) changes.push([element, [{ opacity: 0 }, { opacity: 1 }], APPEAR])
    else if (Math.abs(from.top - top) >= 1) changes.push([element, [{ transform: `translateY(${from.top - top}px)` }, { transform: "none" }], MOVE])
  }
  const gone = previous ? [...previous].filter(([key]) => !seen.has(key)) : []
  if (changes.length + gone.length > MOST_MOVES || prefersReducedMotion()) return
  for (const [, row] of gone) changes.push([standIn(grid, origin, row), [{ opacity: 1 }, { opacity: 0 }], LEAVE])
  for (const [element, keyframes, options] of changes) {
    const animation = element.animate(keyframes, options)
    moves.running.add(animation)
    animation.onfinish = animation.oncancel = () => { moves.running.delete(animation); if ("rowLeaving" in element.dataset) element.remove() }
  }
}

/** A copy of a row that went, laid over the list where the row was: hidden from assistive technology and inert. */
function standIn(grid: HTMLElement, origin: DOMRect, row: Seen) {
  const copy = row.element.cloneNode(true) as HTMLElement
  for (const node of [copy, ...copy.querySelectorAll("*")]) for (const name of STRIPPED) node.removeAttribute(name)
  copy.inert = true
  copy.setAttribute("aria-hidden", "true")
  copy.dataset.rowLeaving = ""
  Object.assign(copy.style, { position: "absolute", top: "0", left: "0", width: `${row.width}px`, margin: "0", pointerEvents: "none" })
  grid.append(copy)
  const at = copy.getBoundingClientRect()
  copy.style.top = `${origin.top + row.top - at.top}px`
  copy.style.left = `${origin.left + row.left - at.left}px`
  return copy
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

/** What list-feel.ts keeps for the list between commits. */
export type Feel = RowMoves & { href: string; hold?: boolean; reread?: () => void; place?: ReturnType<typeof keepPlace> }

/** After each commit: rows slide into place, and a new address keeps the position the list has now. */
export function commit(feel: Feel, grid: HTMLElement | null, still: string, href: string, hold: boolean, reread: () => void) {
  Object.assign(feel, { hold, reread })
  moveRows(grid, still, feel)
  if (feel.href !== href) { feel.href = href; feel.place?.moved() }
}

/** While the list is shown: its place (for a workspace and person), and fresh rows on the tab's return unless a change is unconfirmed. */
export function mount(feel: Feel, scroller: HTMLElement | null, scope: string | null) {
  const place = feel.place = scroller && scope ? keepPlace(scroller, scope, () => feel.href) : undefined
  const stop = refreshOnReturn(() => { if (!feel.hold) feel.reread?.() })
  return () => { place?.stop(); stop() }
}
