/**
 * The link a click follows in this tab, or null: a plain primary click (no modifier keys) on a link that isn't a
 * download and doesn't open elsewhere. The offline guard holds such a move while offline
 * (src/components/shell/offline-guard.tsx); the pressed state marks it until the next page arrives
 * (src/components/loading/loading-feel-listeners.ts). Browser-only, tiny: it is on every page.
 */
export function plainLinkClick(event: MouseEvent): HTMLAnchorElement | null {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const link = (event.target as Element | null)?.closest?.("a[href]")
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return null
  return link
}
