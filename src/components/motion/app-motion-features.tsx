"use client";

import type { ReactNode } from "react";
import { LazyMotion, domMax } from "motion/react";

/**
 * The signed-in app's Motion features (`motion-features.tsx` explains the split): everything the root gives every page,
 * plus layout (`layout`, `layoutId`: the sidebar, segmented-control and settings highlights, chip and pagination
 * re-flows) and drag (the account sheet). Mounted around the whole `(app)` layout, so these are in each
 * signed-in page's first code and registered before any of its components renders. A component that uses `layout`,
 * `layoutId`, `drag` or `onPan*` renders only inside it; `motion-features.test.ts` holds that line.
 */
export function AppMotionFeatures({ children }: { children: ReactNode }) {
  return <LazyMotion features={domMax}>{children}</LazyMotion>;
}
