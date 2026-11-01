"use client";

import type { ReactNode } from "react";
import { LazyMotion, domAnimation } from "motion/react";

/**
 * #266 (Build 3, lighter pages): Motion's own split, `LazyMotion` with `m` components. Each page carries the Motion
 * features its components can use in its first code, and nothing loads later, so no animation looks or behaves
 * differently at any moment after the first paint: a press made before anything else has loaded scales as always.
 *
 * Every page (mounted once in the root layout): the renderer, animations and gestures (`domAnimation`: entrances,
 * exits, variants, `animate()`, and press, hover and focus states such as Arc Button's press scale). The signed-in
 * app adds layout and drag (`app-motion-features.tsx`, around the `(app)` layout), which only its components use.
 *
 * Arc components render `m.*`; a `motion.*` component would bring all of Motion back into the page
 * (docs/design-system/arc-sources.md, "Motion features").
 */
export function MotionFeatures({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
