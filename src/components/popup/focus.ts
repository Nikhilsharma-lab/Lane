/**
 * #263: where focus goes when a Lane popup or in-page form opens and closes. Lane relies on the Arc overlays'
 * own focus trap; these helpers only choose the element at each end.
 */

const FIELDS = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea:not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled]):not([aria-disabled="true"])'
const TABBABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** On screen and able to take focus: laid out, not hidden or inert, not the page itself. */
export function isFocusable(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element !== document.body && element.isConnected && element.getClientRects().length > 0
    && !element.closest("[hidden], [inert]") && getComputedStyle(element).visibility !== "hidden"
}

/** What opening takes focus to inside `container`: its first field, so typing can start, else its first control. */
export function firstFocusTarget(container: Element | null | undefined) {
  if (!container) return null
  return Array.from(container.querySelectorAll(FIELDS)).find(isFocusable)
    ?? Array.from(container.querySelectorAll(TABBABLE)).find(isFocusable)
    ?? null
}

/**
 * The control a popup hands focus back to: the focused element when it opened. A menu item that opened it
 * closes with its menu, so its menu's button stands in.
 */
export function openerOf(active: Element | null) {
  const menu = active?.closest('[role="menu"]')
  if (menu?.id) {
    const button = document.querySelector(`[aria-controls="${CSS.escape(menu.id)}"]`)
    if (button) return button
  }
  return active instanceof HTMLElement && active !== document.body ? active : null
}

/** Focuses `element` without scrolling; true if it took focus. */
export function focusWithoutScroll(element: HTMLElement | null | undefined) {
  if (!isFocusable(element)) return false
  element.focus({ preventScroll: true })
  return document.activeElement === element
}
