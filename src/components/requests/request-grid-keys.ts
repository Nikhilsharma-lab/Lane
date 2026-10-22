/**
 * Plan item 2.4 (decision 8.24): the Requests list's key commands, as pure
 * functions. The grid is an APG treegrid when grouped and a grid when not; the
 * row is the one tab stop. use-request-grid.ts applies these to the DOM.
 */

export { isTypingTarget } from "@/lib/keyboard-guards"

/** A row in the grid: "r:{Request id}" or "g:{group key}". */
export type GridKey = string

export type GridCommand = "next" | "previous" | "first" | "last" | "expand" | "collapse" | "activate" | "select" | "filter" | "peek"
/** Keys that work while focus is elsewhere on the list page. */
export type ListCommand = "focus-next" | "focus-previous" | "filter"

export type KeyLike = {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  repeat?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
}

const LETTER = /^[a-z]$/i

/** The checks every new key shares: nothing typed, composed, already handled, or chorded. Request detail's keys share them (plan item 2.5). */
export function plain(event: KeyLike, typing: boolean) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || typing) return false
  // Shift turns a letter into another key (Shift J is not J).
  if (event.shiftKey && LETTER.test(event.key)) return false
  return true
}

const REPEATS = new Set(["next", "previous"])

/** The command a key gives inside the grid, or null. */
export function gridCommand(event: KeyLike, typing = false): GridCommand | null {
  if (!plain(event, typing)) return null
  const key = LETTER.test(event.key) ? event.key.toLowerCase() : event.key
  // Arrows, Home, End and Enter mean nothing with Shift here.
  if (event.shiftKey && !LETTER.test(event.key)) return null
  const command: GridCommand | null =
    key === "j" || key === "ArrowDown" ? "next"
      : key === "k" || key === "ArrowUp" ? "previous"
        : key === "Home" ? "first"
          : key === "End" ? "last"
            : key === "ArrowRight" ? "expand"
              : key === "ArrowLeft" ? "collapse"
                : key === "Enter" ? "activate"
                  : key === "x" ? "select"
                    : key === "f" ? "filter"
                      // Plan item 2.12: Space previews the Request beside the list.
                      : key === " " ? "peek"
                        : null
  if (command && event.repeat && !REPEATS.has(command)) return null
  return command
}

/** The command a key gives elsewhere on the list page (focus outside the grid), or null. */
export function listCommand(event: KeyLike, typing = false): ListCommand | null {
  if (!plain(event, typing)) return null
  const key = event.key.toLowerCase()
  if (key === "j") return "focus-next"
  if (key === "k") return "focus-previous"
  if (key === "f" && !event.repeat) return "filter"
  return null
}

export const isGroupKey = (key: GridKey) => key.startsWith("g:")
export const requestIdOf = (key: GridKey) => key.startsWith("r:") ? key.slice(2) : null

/** The row a move lands on, or an edge to cross to the next or previous page. */
export function nextKey(keys: GridKey[], from: GridKey, command: "next" | "previous" | "first" | "last"): { key: GridKey } | { edge: "next-page" | "previous-page" } | null {
  if (!keys.length) return null
  if (command === "first") return { key: keys[0] }
  if (command === "last") return { key: keys[keys.length - 1] }
  const index = keys.indexOf(from)
  if (index < 0) return { key: keys[0] }
  const target = index + (command === "next" ? 1 : -1)
  if (target >= keys.length) return { edge: "next-page" }
  if (target < 0) return { edge: "previous-page" }
  return { key: keys[target] }
}

/** The group header above a Request row, in page order. */
export function headerOf(keys: GridKey[], from: GridKey): GridKey | null {
  for (let index = keys.indexOf(from) - 1; index >= 0; index--) if (isGroupKey(keys[index])) return keys[index]
  return null
}

/**
 * The row that holds the one tab stop: the active row while it is shown,
 * otherwise the row that took its place (the same index, or the last row).
 */
export function tabbableKey(keys: GridKey[], active: { key: GridKey; index: number } | null): GridKey | null {
  if (!keys.length) return null
  if (active && keys.includes(active.key)) return active.key
  return keys[Math.min(Math.max(active?.index ?? 0, 0), keys.length - 1)]
}

/**
 * The grid's rows in page order. Grouped: each group with a Request on this
 * page gives its header, then its rows on this page unless it is collapsed;
 * a group with no Requests at all (an empty board column) gives its header on
 * every page. Ungrouped: the page's rows.
 */
export function gridKeysFor(groups: { key: string; rows: { id: string }[] }[] | null, pageRows: { id: string }[], collapsedGroups: string[]): GridKey[] {
  if (!groups) return pageRows.map(row => `r:${row.id}`)
  const onPage = new Set(pageRows.map(row => row.id))
  return groups.flatMap(group => {
    const rows = group.rows.filter(row => onPage.has(row.id))
    if (!rows.length && group.rows.length) return []
    return [`g:${group.key}`, ...(collapsedGroups.includes(group.key) ? [] : rows.map(row => `r:${row.id}`))]
  })
}
