/**
 * Build 4 (#256): a tip whose trigger sits outside a popup that has just taken focus (the ⌘K palette, the composer,
 * the shortcuts dialog, a menu) closes, and doesn't open while that popup has focus. Left showing, a tip under a
 * resting pointer was Radix's top layer and took the popup's Escape. Browser-only, tiny: the tips are on every page.
 */
import { flushSync } from "react-dom"

const POPUP = '[role="dialog"],[role="alertdialog"],[role="menu"]'

/** Whether focus is in a popup the tip's trigger isn't part of. */
export const popupElsewhere = (trigger: Element | null) => {
  const popup = document.activeElement?.closest(POPUP)
  return !!popup && !popup.contains(trigger)
}

/**
 * While a tip is open: calls `close` when focus moves into a popup elsewhere, and commits it at once: left to React's
 * schedule, the popup's own opening render could keep the tip on screen until after the person's Escape. Returns the stop.
 */
export function closeWhenPopupTakesFocus(trigger: Element | null, close: () => void) {
  const moved = () => { if (popupElsewhere(trigger)) flushSync(close) }
  addEventListener("focusin", moved, true)
  return () => removeEventListener("focusin", moved, true)
}
