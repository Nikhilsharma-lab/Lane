"use client";

import { useCallback, useRef, useState } from "react";

type RecoverableActionOutcome<T> =
  | { status: "completed"; value: T }
  | { status: "failed"; error: unknown }
  | { status: "blocked" };

/**
 * Runs one user action at a time and always releases its pending state.
 *
 * The ref is the duplicate-submit guard: unlike React state, it changes before
 * another click or Enter key event can start the same action.
 */
export function useRecoverableAction() {
  const activeRef = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<RecoverableActionOutcome<T>> => {
      if (activeRef.current) {
        return { status: "blocked" };
      }

      activeRef.current = true;
      setPending(true);

      try {
        return { status: "completed", value: await action() };
      } catch (error) {
        return { status: "failed", error };
      } finally {
        activeRef.current = false;
        setPending(false);
      }
    },
    []
  );

  return { pending, run };
}
