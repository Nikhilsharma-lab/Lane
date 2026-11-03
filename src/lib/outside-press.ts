/**
 * #269 (A15, A16): a press outside an open menu or the navigation peek only closes it, as a press outside a dialog
 * does. Call it from the capture-phase `pointerdown` (on the document or window) that closes the layer: that press
 * and what it turns into (the mouse and touch events, the click, a right-click's context menu) never reach the page
 * underneath, and focus stays where it was for the layer to hand back. Browser-only.
 */
const FOLLOWERS = ["pointerup", "mousedown", "mouseup", "touchend", "click", "auxclick", "contextmenu"]
const OPTIONS = { capture: true, passive: false }

export function swallowPress(press: PointerEvent) {
  press.preventDefault()
  press.stopImmediatePropagation()
  let timer = 0
  // Held until its click, or a moment after the press lifts (a tap's click comes just after); the next press is a
  // new one, and a press that never lifts here (a drag away) lets go in time.
  const wait = (ms: number) => { clearTimeout(timer); timer = window.setTimeout(release, ms) }
  const hold = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type == "click") release()
    else if (/up|end/.test(event.type)) wait(400)
  }
  const release = () => {
    clearTimeout(timer)
    for (const type of FOLLOWERS) removeEventListener(type, hold, OPTIONS)
    removeEventListener("pointerdown", release, true)
  }
  for (const type of FOLLOWERS) addEventListener(type, hold, OPTIONS)
  addEventListener("pointerdown", release, true)
  wait(2000)
}
