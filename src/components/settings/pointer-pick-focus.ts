"use client";

import { useRef, type RefObject } from "react";

/**
 * #288 (D35): after a pick with the pointer, a select's trigger gets focus back without the keyboard ring (Arc: no ring
 * on pointer focus). A pick from the keyboard keeps the shared ring. Pass the select's trigger, give `keyboard` to
 * its list's onKeyDown, and call `settle` when a value is picked.
 */
export function usePointerPickFocus(trigger: RefObject<HTMLButtonElement | null>) {
  const byKeyboard = useRef(false);
  return {
    keyboard: () => { byKeyboard.current = true; },
    settle: () => {
      const keyboard = byKeyboard.current;
      byKeyboard.current = false;
      if (keyboard) return;
      // The list hands focus back to the trigger as it closes; then it is given again without the ring.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const node = trigger.current;
        if (!node || document.activeElement !== node || !node.matches(":focus-visible")) return;
        node.blur();
        node.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      }));
    },
  };
}
