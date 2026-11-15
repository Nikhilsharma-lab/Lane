"use client";

import { useEffect, useState } from "react";
import { motionTokens } from "@/components/arc/lib/motion-tokens";

/**
 * Whether work that is `pending` should look busy yet: only once it has run past the polish bar's placeholder delay
 * (`--duration-fast`, 0.15s), the same wait the placeholders keep. A quick answer never flashes a spinner.
 */
export function useDelayedBusy(pending: boolean): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setLate(true), motionTokens.duration.fast * 1000);
    return () => { window.clearTimeout(timer); setLate(false); };
  }, [pending]);
  return pending && late;
}
