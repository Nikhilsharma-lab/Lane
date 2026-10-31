"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { LazyMotion, domMin, type FeatureBundle } from "motion/react";
import { afterPageLoad } from "@/lib/after-page-load";

/**
 * #266 (Build 3, lighter pages): Motion's own split, `LazyMotion` with `m` components. Every page's first code
 * carries Motion's renderer and its animations (domMin: entrances, exits, variants, `animate()`), so whatever
 * appears on the first paint or opens with a popup moves exactly as before. The rest of Motion (gestures, drag
 * and layout: the press scale, swipes, the highlight that glides between items) loads separately, following
 * Build 2's rule (after-page-load.ts): at the first press or key anywhere in the page, from `load` on also focus,
 * or once the page has loaded and is idle. Never before `load` on its own: fetched earlier, it holds that event
 * back on a slow phone. Until it arrives a press doesn't scale and a highlight moves without gliding.
 *
 * Mounted once in the root layout. Arc components render `m.*`; a `motion.*` component would bring all of Motion
 * back into the page (docs/design-system/arc-sources.md, "Motion features").
 */
let full: FeatureBundle | null = null;
let loading: Promise<FeatureBundle> | null = null;
const listeners = new Set<() => void>();

export function loadMotionFeatures(): Promise<FeatureBundle> {
  loading ??= import("./motion-features-bundle").then(module => {
    full = module.features;
    listeners.forEach(listener => listener());
    return module.features;
  });
  return loading;
}

if (typeof window !== "undefined") {
  // Focus before `load` is the page's own (autofocus, hydration), not someone reaching for something.
  const INTENT = ["pointerdown", "keydown"] as const;
  const start = () => {
    for (const type of INTENT) document.removeEventListener(type, start, true);
    document.removeEventListener("focusin", start, true);
    void loadMotionFeatures().catch(() => { loading = null; });
  };
  for (const type of INTENT) document.addEventListener(type, start, true);
  const focusCounts = () => { if (!loading) document.addEventListener("focusin", start, true); };
  if (document.readyState === "complete") focusCounts();
  else window.addEventListener("load", focusCounts, { once: true });
  afterPageLoad(start);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function MotionFeatures({ children }: { children: ReactNode }) {
  const features = useSyncExternalStore(subscribe, () => full ?? domMin, () => domMin);
  useEffect(() => {
    // For the browser tests: gestures, drag and layout work from this commit on.
    if (features !== domMin) document.documentElement.dataset.motionFeatures = "ready";
  }, [features]);
  return <LazyMotion features={features}>{children}</LazyMotion>;
}
