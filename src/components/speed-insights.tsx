"use client";

import { lazy, Suspense } from "react";

import { withoutQueryOrHash } from "@/lib/speed-insights";

// The package arrives through a lazy import, so only this wrapper sits in every route's first load and the
// reporter itself is fetched after hydration (2 KB per-route budget, scripts/bundle-baseline.mjs).
const VercelSpeedInsights = lazy(() =>
  import("@vercel/speed-insights/next").then(({ SpeedInsights }) => ({ default: SpeedInsights })),
);

/**
 * Decision 8.13 (leftover plan L3): Vercel Speed Insights field metrics. The root layout renders this only on
 * the production deployment at app.uselane.app (reportsSpeedInsights). There the package loads its script
 * from, and posts to, a same-origin `/_vercel/...` path that the CSP's 'self' covers (src/lib/security-headers.ts).
 */
export function SpeedInsights() {
  return (
    <Suspense fallback={null}>
      <VercelSpeedInsights beforeSend={withoutQueryOrHash} />
    </Suspense>
  );
}
