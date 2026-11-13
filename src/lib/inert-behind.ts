/**
 * #281 (B37): while a modal menu is open, what's behind it can't take focus. Radix hides everything outside an open
 * Select or DropdownMenu from screen readers (`aria-hidden`), but the sidebar, the skip link and the page stayed
 * focusable behind it: axe's "aria-hidden-focus". This marks the same elements `inert`: the body's content outside
 * the menu, keeping the ancestors of live regions and scripts so announcements still arrive, as Radix's `aria-hidden`
 * does. It lifts as soon as the menu starts closing (`data-state` leaves "open"), so focus can go back during the
 * menu's exit.
 *
 * Use it as the menu content's ref: `<Content ref={inertBehind}>`. Several open layers count, so closing one never
 * frees what another still holds; an element that was inert already is left as it was.
 */
const held = new Map<Element, number>()

export function inertBehind(layer: HTMLElement | null): (() => void) | undefined {
  if (!layer?.isConnected) return
  const body = layer.ownerDocument.body
  const stops = new Set<Element>([layer, ...body.querySelectorAll("[aria-live], script")])
  const keep = new Set<Element>()
  for (const target of stops) for (let node: Element | null = target; node && node !== body && !keep.has(node); node = node.parentElement) keep.add(node)
  const made: Element[] = []
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      if (stops.has(child)) continue
      if (keep.has(child)) { walk(child); continue }
      const count = held.get(child) ?? 0
      if (!count && child.hasAttribute("inert")) continue
      held.set(child, count + 1)
      if (!count) child.setAttribute("inert", "")
      made.push(child)
    }
  }
  walk(body)
  let released = false
  const release = () => {
    if (released) return
    released = true
    closing.disconnect()
    for (const child of made) {
      const count = (held.get(child) ?? 1) - 1
      if (count) held.set(child, count)
      else { held.delete(child); child.removeAttribute("inert") }
    }
  }
  const closing = new MutationObserver(() => { if (layer.dataset.state && layer.dataset.state !== "open") release() })
  closing.observe(layer, { attributes: true, attributeFilter: ["data-state"] })
  return release
}
