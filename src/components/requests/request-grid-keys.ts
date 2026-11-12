/**
 * Plan item 2.4 (decision 8.24): the Requests list's key commands, as pure
 * functions. The grid is an APG treegrid when grouped and a grid when not; the
 * row is the one tab stop. use-request-grid.ts applies these to the DOM.
 */

export { isTypingTarget } from "@/lib/keyboard-guards"

/** A row in the grid: "r:{Request id}", "g:{group key}" (a group header) or "m:{group key}" (that group's Show more, A212). */
export type GridKey = string

/** ↓ and ↑ ("next", "previous") stop on every row; J and K ("next-request", "previous-request") only on Requests (#240 decision 5). */
export type GridMove = "next" | "previous" | "next-request" | "previous-request" | "first" | "last"
export type GridCommand = GridMove | "expand" | "collapse" | "activate" | "select" | "filter" | "peek"
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

const REPEATS = new Set(["next", "previous", "next-request", "previous-request"])

/** The command a key gives inside the grid, or null. */
export function gridCommand(event: KeyLike, typing = false): GridCommand | null {
  if (!plain(event, typing)) return null
  const key = LETTER.test(event.key) ? event.key.toLowerCase() : event.key
  // Arrows, Home, End and Enter mean nothing with Shift here.
  if (event.shiftKey && !LETTER.test(event.key)) return null
  const command: GridCommand | null =
    key === "j" ? "next-request"
      : key === "ArrowDown" ? "next"
      : key === "k" ? "previous-request"
      : key === "ArrowUp" ? "previous"
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
export const isMoreKey = (key: GridKey) => key.startsWith("m:")
export const requestIdOf = (key: GridKey) => key.startsWith("r:") ? key.slice(2) : null
/** The group a header's or Show more's key names. */
export const groupOfKey = (key: GridKey) => isGroupKey(key) || isMoreKey(key) ? key.slice(2) : null

/** The row a move lands on, or null when nothing is there: the list has no pages, so its ends stay put (A212). */
export function nextKey(keys: GridKey[], from: GridKey, command: GridMove): { key: GridKey } | null {
  if (!keys.length) return null
  if (command === "first") return { key: keys[0] }
  if (command === "last") return { key: keys[keys.length - 1] }
  const step = command === "next" || command === "next-request" ? 1 : -1
  const stops = (key: GridKey) => command === "next" || command === "previous" || requestIdOf(key) !== null
  const index = keys.indexOf(from)
  if (index < 0) {
    const first = keys.find(stops)
    return first ? { key: first } : null
  }
  for (let target = index + step; target >= 0 && target < keys.length; target += step) if (stops(keys[target])) return { key: keys[target] }
  return null
}

/** The group header above a Request row or a Show more, in list order. */
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
 * The grid's rows in list order, from each group's shown rows (A212). Grouped: each group gives its header, then,
 * unless it is folded, its shown Requests and its Show more when it has more. Ungrouped: the one group's rows and
 * its Show more, with no header.
 */
export function gridKeysFor(groups: { key: string; rows: { id: string }[]; more: boolean }[], { headers, collapsedGroups }: { headers: boolean; collapsedGroups: string[] }): GridKey[] {
  return groups.flatMap(group => {
    const open = !headers || !collapsedGroups.includes(group.key)
    return [...(headers ? [`g:${group.key}`] : []), ...(open ? group.rows.map(row => `r:${row.id}`) : []), ...(open && group.more ? [`m:${group.key}`] : [])]
  })
}
