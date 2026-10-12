/**
 * Plan item 2.4: the checks Lane's single-key shortcuts share. They live
 * apart from the list's grid and focus helpers so the authenticated shell
 * (the `?` overlay on every page) carries only these few lines.
 */

const TYPING = "input, textarea, select, [role='textbox'], [role='combobox'], [contenteditable]:not([contenteditable='false'])"

/** A field the person is typing in; no single-key shortcut applies there. */
export function isTypingTarget(target: EventTarget | null) {
  return typeof Element !== "undefined" && target instanceof Element && (target.closest(TYPING) !== null || (target instanceof HTMLElement && target.isContentEditable))
}

const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/**
 * The C shortcut's check: a visible dialog, menu or listbox owns the keyboard.
 * A closed panel that stays laid out but inert or visibility: hidden (the
 * phone navigation sheet) does not count.
 */
export function overlayOpen() {
  return Array.from(document.querySelectorAll<HTMLElement>(OVERLAYS)).some(element => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true"
    && !element.closest("[inert]") && getComputedStyle(element).visibility !== "hidden")
}

/** Laid out and not inside a hidden or inert subtree. */
export function isShown(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > 0 && !element.closest("[hidden], [inert]")
}
