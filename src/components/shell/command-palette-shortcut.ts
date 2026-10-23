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
