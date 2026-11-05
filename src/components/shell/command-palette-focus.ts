type Focusable = { focus: (options?: FocusOptions) => void }

/**
 * Issue #106: where focus goes as the palette opens and closes, apart from
 * the Dialog so it is testable without a DOM. `returnFocus` holds what had
 * focus when ⌘K was pressed; `isShown` is the shared visibility check.
 */
export function createPaletteFocus<T extends Focusable>(returnFocus: { current: T | null }, isShown: (element: T | null) => element is T) {
  // Set when an entry runs: focus has already gone back, or to the surface the entry opened.
  let handled = false
  return {
    /** Arc's Dialog opened: its field takes focus. */
    opened(field: Focusable | null) {
      handled = false
      field?.focus()
    },
    /**
     * An entry runs: close, put focus back where ⌘K was pressed, and return that element, all before the
     * entry acts, so a "Pick up anyway?" or the composer then hands focus back there too.
     */
    run(close: () => void): T | null {
      const target = returnFocus.current
      handled = true
      close()
      if (isShown(target)) target.focus({ preventScroll: true })
      return target
    },
    /**
     * The Dialog's close focus. True when focus was placed here (or is to stay where it is), so the caller stops the
     * Dialog's own. It comes as the leaving palette unmounts, after its exit: `moved` when the person has already put
     * focus elsewhere meanwhile (Tab, a click, a toast's Undo), and then it stays there.
     */
    closed(moved = false): boolean {
      const target = returnFocus.current
      returnFocus.current = null
      if (handled) { handled = false; return true }
      if (moved) return true
      if (!isShown(target)) return false
      target.focus({ preventScroll: true })
      return true
    },
  }
}
