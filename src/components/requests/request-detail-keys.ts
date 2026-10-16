/**
 * Plan item 2.5 (decision D1): Request detail's key commands, as a pure
 * function, mirroring request-grid-keys.ts. J and K move to the next and
 * previous Request anywhere on detail. The arrows do the same only while
 * focus is on the previous or next button: elsewhere they scroll the reading
 * column, which keyboard users need (WCAG 2.1.1). Esc is owned by
 * request-workspace-keyboard.tsx, which closes a form before leaving.
 */

import { plain, type KeyLike } from "./request-grid-keys"

export { isTypingTarget } from "@/lib/keyboard-guards"

export type DetailCommand = "next" | "previous"

/** The command a key gives on Request detail, or null. A held key gives nothing: one press, one Request. */
export function detailCommand(event: KeyLike, typing = false, onNavButtons = false): DetailCommand | null {
  if (!plain(event, typing) || event.repeat) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (event.shiftKey && key.length > 1) return null
  if (key === "j" || (onNavButtons && key === "ArrowDown")) return "next"
  if (key === "k" || (onNavButtons && key === "ArrowUp")) return "previous"
  return null
}
