"use client";

import { useEffect, useRef } from "react";

/**
 * #288 (D35): after a pick with the pointer, a select's trigger gets focus back without the keyboard ring (Arc: no ring
 * on pointer focus). A pick from the keyboard keeps the shared ring. Give `trigger` to the select's trigger,
 * `keyboard` to its list's onKeyDown, and call `settle` when a value is picked.
 */
export function usePointerPickFocus() {
  const trigger = useRef<HTMLButtonElement>(null);
  const byKeyboard = useRef(false);
  useEffect(() => {
    const pointer = () => { byKeyboard.current = false; };
    window.addEventListener("pointerdown", pointer, true);
    return () => window.removeEventListener("pointerdown", pointer, true);
  }, []);
  return {
    trigger,
    keyboard: () => { byKeyboard.current = true; },
    settle: () => {
      if (byKeyboard.current) return;
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
