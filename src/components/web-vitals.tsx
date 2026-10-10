"use client";

import { lazy, Suspense } from "react";
import type { useReportWebVitals } from "next/web-vitals";

type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

// Module scope: useReportWebVitals re-subscribes whenever the callback changes.
function logMetric(metric: Metric) {
  const value = metric.name === "CLS" ? metric.value.toFixed(4) : `${Math.round(metric.value)} ms`;
  console.debug(`[web-vitals] ${metric.name} ${value} (${metric.rating})`);
}

// Loaded only in development. A static import of next/web-vitals stays in the
// production bundle even when nothing calls it (measured: about 2.8 KB gzip on
// every route), so the hook arrives through a lazy import in a branch the
// production build removes.
const DevelopmentWebVitals = process.env.NODE_ENV === "development"
  ? lazy(() => import("next/web-vitals").then(({ useReportWebVitals: report }) => ({
      default: function DevelopmentWebVitals() {
        report(logMetric);
        return null;
      },
    })))
  : null;

/**
 * Plan item 1.15b: Web Vitals from the root layout through useReportWebVitals.
 * In development each metric is logged so a slow interaction can be read off
 * the console next to the perf spec's numbers. In production nothing is
 * posted yet: Speed Insights is decision 8.13 and adds a dependency. When it
 * lands, report from here.
 */
export function WebVitals() {
  return DevelopmentWebVitals ? <Suspense fallback={null}><DevelopmentWebVitals /></Suspense> : null;
}
