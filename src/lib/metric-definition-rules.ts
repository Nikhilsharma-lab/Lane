/**
 * Client-safe facts about Metric definitions (#196). The Metrics library itself, which owns every read
 * and write of definitions, is src/lib/metrics-library.ts (server only).
 */

/** The four units Lane measures in. Stored as these keys, the same ones saved predictions use. */
export const METRIC_UNITS = ["percent", "count", "seconds", "minutes"] as const;
export type MetricUnit = typeof METRIC_UNITS[number];

const UNIT_NAMES: Record<MetricUnit, string> = { percent: "Percentage", count: "Count", seconds: "Seconds", minutes: "Minutes" };

/** A unit as the Metrics page names it. */
export function metricUnitName(unit: MetricUnit): string {
  return UNIT_NAMES[unit];
}

/** The built-in keys behind the seven starter metrics. The Pass/fail check is not one of them. */
export const STARTER_METRIC_KEYS = ["conversion", "adoption", "error", "support", "csat", "duration", "events"] as const;
export type StarterMetricKey = typeof STARTER_METRIC_KEYS[number];

export const METRIC_NAME_MAX = 120;
export const METRIC_LINK_MAX = 2048;
export const METRIC_HOW_COUNTED_MAX = 500;
