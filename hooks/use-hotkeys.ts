"use client";

import { useEffect, useRef, useCallback } from "react";

interface HotkeySequence {
  keys: [string, string];
  action: () => void;
  description?: string;
}

export function useHotkeys(sequences: HotkeySequence[]) {
  const firstKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const key = e.key.toLowerCase();

      if (firstKeyRef.current) {
        const first = firstKeyRef.current;
        firstKeyRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);

        const match = sequences.find(
          (s) => s.keys[0] === first && s.keys[1] === key
        );
        if (match) {
          e.preventDefault();
          match.action();
        }
        return;
      }

      const isFirstKey = sequences.some((s) => s.keys[0] === key);
      if (isFirstKey) {
        firstKeyRef.current = key;
        timerRef.current = setTimeout(() => {
          firstKeyRef.current = null;
        }, 500);
      }
    },
    [sequences]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}
