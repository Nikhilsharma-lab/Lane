/**
 * Plan item 2.4: where focus goes back to on the Requests list. The row is the
 * list's one tab stop, so every restoration targets the row, not its title link.
 */

export const requestRowSelector = (id: string) => `[role="row"][data-request-id="${CSS.escape(id)}"]`
const WORKSPACE = '[data-slot="requests-workspace"]'
const TAB_STOP = '[role="row"][tabindex="0"]'
const TITLE_FILTER = 'button[aria-label="Filter Requests by title"]'
// Arc ToastStack's region: the only live section that lists additions (Undo, Show it).
const TOAST_STACK = 'section[aria-live][aria-relevant]'

/** Laid out and not inside a hidden or inert subtree. */
export function isShown(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > 0 && !element.closest("[hidden], [inert]")
}

/** Focus may be moved for the person only when it is nowhere they chose: the page, the list, or a toast. */
export function mayRestoreFocus() {
  const active = document.activeElement
  return !active || active === document.body || active === document.documentElement || Boolean(active.closest(`${WORKSPACE}, ${TOAST_STACK}`))
}

function focus(element: HTMLElement) {
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: "nearest" })
  return document.activeElement === element
}

export type RestoredTo = "row" | "nearby" | "tab-stop" | "filter" | "none"

/**
 * Focuses the Request's row when it is shown. Otherwise the row now at
 * `index` among the grid's rows (the one that took its place), then the
 * grid's tab stop, then the title filter. Does nothing while focus is
 * somewhere the person put it.
 */
export function restoreRequestFocus(id: string, { index = -1, force = false }: { index?: number; force?: boolean } = {}): RestoredTo {
  if (!force && !mayRestoreFocus()) return "none"
  const row = document.querySelector(requestRowSelector(id))
  if (isShown(row) && focus(row)) return "row"
  const workspace = document.querySelector(WORKSPACE) ?? document
  if (index >= 0) {
    const rows = [...workspace.querySelectorAll("[data-grid-row]")].filter(isShown)
    const nearby = rows[Math.min(index, rows.length - 1)]
    if (nearby && focus(nearby)) return "nearby"
  }
  const tabStop = workspace.querySelector(TAB_STOP)
  if (isShown(tabStop) && focus(tabStop)) return "tab-stop"
  const filter = workspace.querySelector(TITLE_FILTER)
  if (isShown(filter) && focus(filter)) return "filter"
  return "none"
}

/** The index of this Request's row among the grid's shown rows, read before a move regroups it. */
export function rowIndexOf(id: string) {
  const row = document.querySelector(requestRowSelector(id))
  const grid = row?.closest('[role="grid"], [role="treegrid"]')
  if (!row || !grid) return -1
  return [...grid.querySelectorAll("[data-grid-row]")].filter(isShown).indexOf(row as HTMLElement)
}
