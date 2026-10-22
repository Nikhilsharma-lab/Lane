/**
 * Issue #106 (spec #101): the ⌘K palette's keys, as pure commands so the
 * guards and the list's keyboard use are unit-tested without a DOM, as
 * request-grid-keys.ts does for the list.
 */
export type ShortcutKey = {
  key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean
  repeat: boolean; isComposing: boolean; defaultPrevented: boolean
}

/**
 * ⌘K or Ctrl+K. Closed, it respects the shared guards (isTypingTarget,
 * overlayOpen). Open, the palette's own field is a combobox and its own
 * dialog an overlay, so the guards are skipped and the key closes it.
 */
export function paletteShortcut(event: ShortcutKey, state: { open: boolean; typing: boolean; overlay: boolean }): "open" | "close" | null {
  if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null
  if (event.repeat || event.isComposing || event.defaultPrevented) return null
  if (state.open) return "close"
  return state.typing || state.overlay ? null : "open"
}

export type ListKey = { key: string; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean; isComposing: boolean }
export type PaletteStep = "entries" | "priority"
export type ListCommand = { type: "active"; index: number } | { type: "run" } | { type: "back" }

/**
 * The APG combobox keys on the palette's field: the arrows (wrapping), Home
 * and End move the active option, Enter runs it. On the priority step, Esc,
 * or Backspace in an empty box, goes back one step. Esc on the first step is
 * the dialog's own (it closes). Every other key is the field's.
 */
export function paletteListKey(event: ListKey, list: { count: number; active: number; query: string; step: PaletteStep }): ListCommand | null {
  if (event.isComposing || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return null
  if (list.step === "priority" && (event.key === "Escape" || (event.key === "Backspace" && !list.query))) return { type: "back" }
  if (!list.count) return null
  switch (event.key) {
    case "ArrowDown": return { type: "active", index: (list.active + 1) % list.count }
    case "ArrowUp": return { type: "active", index: (list.active - 1 + list.count) % list.count }
    case "Home": return { type: "active", index: 0 }
    case "End": return { type: "active", index: list.count - 1 }
    case "Enter": return { type: "run" }
    default: return null
  }
}
