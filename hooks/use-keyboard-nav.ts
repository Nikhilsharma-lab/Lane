import { useState, useEffect, useCallback } from "react";

export function useKeyboardNav(count: number) {
  const [focused, setFocused] = useState(-1);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;

      if (isInput) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocused((prev) => (prev < count - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocused((prev) => (prev > 0 ? prev - 1 : prev));
      }
    },
    [count]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset focus when list length changes (filter, sort)
  useEffect(() => {
    setFocused(-1);
  }, [count]);

  return { focused, setFocused };
}
