/**
 * Issue #106 (spec #101): ⌘K as a pure command, so the guards are unit-tested
 * without a DOM. It is the only palette code in every route's first load, so
 * it lives apart from the list keys (command-palette-keys.ts).
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

export type TypeaheadCommand = { type: "type"; text: string } | { type: "close" }

/**
 * #268 (A12): a key pressed after ⌘K and before the palette's field has focus (its code may still be loading).
 * Letters, digits, punctuation and spaces are kept for the field, Backspace takes the last one back, and Escape
 * closes. Every other plain key is held too, so no page shortcut (C, /, ?) or row key (J, X, Enter) fires
 * underneath. Chords (⌘K, ⌘V) and a composing input method are left to their own handlers.
 */
export function typeaheadKey(event: ShortcutKey, text: string): TypeaheadCommand | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return null
  if (event.key === "Escape") return { type: "close" }
  if (event.key === "Backspace") return { type: "type", text: text.slice(0, -1) }
  return { type: "type", text: [...event.key].length === 1 ? text + event.key : text }
}

/**
 * #268 (A11): Back or Forward closes the open palette when it changes the page. A step that stays on the same
 * address is a phone panel taking its own history entry back off (popup-history.ts). It happens a moment after that
 * panel closes, so a ⌘K pressed in that moment opened a palette the step then closed.
 */
export function paletteClosesOnHistoryStep(addressWhenOpened: string, addressNow: string): boolean {
  return addressNow !== addressWhenOpened
}
