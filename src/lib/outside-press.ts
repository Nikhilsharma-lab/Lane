/**
 * #269 (A15, A16): a press outside an open menu or the navigation peek only closes it, as a press outside a dialog
 * does. Call it from the capture-phase `pointerdown` (on the document or window) that closes the layer: that press
 * and what it turns into (its mouse events, the click, a right-click's context menu) never reach the page
 * underneath, and focus stays where it was for the layer to hand back. Browser-only.
 */
// Holding pointerdown's default already stops the mouse events it would become; the click (a tap's too) and a
// right-click's menu are held here, until the next press or a moment later.
const HELD = ["click", "contextmenu"]

export function swallowPress(press: PointerEvent) {
  press.preventDefault()
  press.stopImmediatePropagation()
  const hold = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); if (event.type == "click") release() }
  const release = () => {
    clearTimeout(timer)
    for (const type of HELD) removeEventListener(type, hold, true)
    removeEventListener("pointerdown", release, true)
  }
  for (const type of HELD) addEventListener(type, hold, true)
  addEventListener("pointerdown", release, true)
  const timer = setTimeout(release, 1500)
}
