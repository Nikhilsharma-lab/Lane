/**
 * Plan item 2.7 (decision 8.10): the notifications popover's key commands, as
 * pure functions mirroring request-grid-keys.ts. J or ↓ and K or ↑ move a
 * roving tab stop over the rows, Home and End jump to the ends, and nothing
 * wraps. Enter is the row button's own activation and Esc is Radix's, so
 * neither is a command here; C, /, ?, F and X give nothing.
 */

import { plain, type KeyLike } from "@/components/requests/request-grid-keys"

export type NotificationCommand = "next" | "previous" | "first" | "last"

const REPEATS = new Set<NotificationCommand>(["next", "previous"])

/** The command a key gives inside the popover, or null. */
export function notificationCommand(event: KeyLike, typing = false): NotificationCommand | null {
  if (!plain(event, typing)) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  // Arrows, Home and End mean nothing with Shift here.
  if (event.shiftKey && key.length > 1) return null
  const command: NotificationCommand | null =
    key === "j" || key === "ArrowDown" ? "next"
      : key === "k" || key === "ArrowUp" ? "previous"
        : key === "Home" ? "first"
          : key === "End" ? "last"
            : null
  if (command && event.repeat && !REPEATS.has(command)) return null
  return command
}

/** The row a move lands on, or null at an edge (no wrap). From outside the rows, the first row. */
export function nextNotificationId(ids: readonly string[], from: string | null, command: NotificationCommand): string | null {
  if (!ids.length) return null
  if (command === "first") return ids[0]
  if (command === "last") return ids[ids.length - 1]
  const index = from === null ? -1 : ids.indexOf(from)
  if (index < 0) return ids[0]
  const target = index + (command === "next" ? 1 : -1)
  if (target < 0 || target >= ids.length) return null
  return ids[target]
}
