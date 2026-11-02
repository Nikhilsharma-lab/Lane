/**
 * #269 (A15, A16): a press outside an open menu or the navigation peek only closes it, as a press outside a dialog
 * does. Call it from the capture-phase `pointerdown` (on the document or window) that closes the layer: that press
 * and what it turns into (the mouse and touch events, the click, a right-click's context menu) never reach the page
 * underneath, and focus stays where it was for the layer to hand back. Browser-only.
 */
const FOLLOWERS = ["pointerup", "mousedown", "mouseup", "touchend", "click", "auxclick", "contextmenu"] as const;
// A tap's click arrives just after the finger lifts; past this the press is over and nothing more is held.
const SETTLE_MS = 400;

export function swallowPress(press: PointerEvent) {
  press.preventDefault();
  press.stopImmediatePropagation();
  let timer = 0;
  const options = { capture: true, passive: false } as const;
  const hold = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") release();
    else if (event.type === "pointerup" || event.type === "touchend") { window.clearTimeout(timer); timer = window.setTimeout(release, SETTLE_MS); }
  };
  function release() {
    window.clearTimeout(timer);
    for (const type of FOLLOWERS) window.removeEventListener(type, hold, options);
    window.removeEventListener("pointerdown", release, true);
  }
  for (const type of FOLLOWERS) window.addEventListener(type, hold, options);
  // The next press is a new one; and a press that never lifts here (a drag away) lets go in time.
  window.addEventListener("pointerdown", release, true);
  timer = window.setTimeout(release, SETTLE_MS * 5);
}
