/**
 * #269 (A15, A16): a press outside an open menu or the navigation peek only closes it, as a press outside a dialog
 * does. That press and what it turns into (its mouse events, the click, a right-click's context menu) never reach
 * the page underneath, and focus stays where it was for the layer to hand back. Browser-only.
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

/** An open layer's answer to a press: true when the press was outside it and it took it (closing, and swallowing). */
type Layer = (press: PointerEvent) => boolean
// Open layers, oldest first: the one opened last (a menu over the peek) is asked first.
const layers: Layer[] = []
const ask = (press: PointerEvent) => { for (let index = layers.length - 1; index >= 0; index--) if (layers[index](press)) return }

/**
 * Listens for presses while a layer is open; returns the stop. The listener is the window's, in the capture phase,
 * so it runs before every listener on the document and the page (React's own included), and a layer that swallows
 * the press does so before anything underneath sees it.
 */
export function onOutsidePress(layer: Layer): () => void {
  if (!layers.length) addEventListener("pointerdown", ask, true)
  layers.push(layer)
  return () => {
    const index = layers.indexOf(layer)
    if (index >= 0) layers.splice(index, 1)
    if (!layers.length) removeEventListener("pointerdown", ask, true)
  }
}
