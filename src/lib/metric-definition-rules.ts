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

/** A Metric definition as the prediction picker offers it (#198). `archived` ones are offered only where a Request already uses them. */
export type MetricChoice = { id: string; name: string; unit: MetricUnit; link: string | null; howCounted: string | null; archived: boolean };

export const METRIC_NAME_MAX = 120;
export const METRIC_LINK_MAX = 2048;
export const METRIC_HOW_COUNTED_MAX = 500;

/** What the forms and the server say about each field (metric-definition-schema.ts uses the same words). */
export const METRIC_DEFINITION_MESSAGES = {
  nameMissing: "Give the metric a name.",
  nameTooLong: `Keep the name to ${METRIC_NAME_MAX} characters or fewer.`,
  unit: "Choose a unit.",
  linkTooLong: `Keep the link to ${METRIC_LINK_MAX} characters or fewer.`,
  linkNotWeb: "Enter a link that starts with https:// or http://.",
  howCountedTooLong: `Keep how it's counted to ${METRIC_HOW_COUNTED_MAX} characters or fewer.`,
};
export const METRIC_WEB_LINK = /^https?:\/\/\S+$/i;

export type MetricDefinitionField = "name" | "unit" | "link" | "howCounted";

/**
 * The forms' check of a definition as typed: the first problem with each field, the same as `metricDefinitionInputSchema`
 * gives (metric-definition-rules.test.ts holds them to it). Plain code, so the Metrics pages don't carry zod (#256);
 * the schema lives in metric-definition-schema.ts, which only the server actions import.
 */
export function metricDefinitionProblems(values: { name: string; unit: string; link: string; howCounted: string }): Partial<Record<MetricDefinitionField, string>> {
  const problems: Partial<Record<MetricDefinitionField, string>> = {};
  const name = values.name.trim();
  if (!name) problems.name = METRIC_DEFINITION_MESSAGES.nameMissing;
  else if (name.length > METRIC_NAME_MAX) problems.name = METRIC_DEFINITION_MESSAGES.nameTooLong;
  if (!(METRIC_UNITS as readonly string[]).includes(values.unit)) problems.unit = METRIC_DEFINITION_MESSAGES.unit;
  const link = values.link.trim();
  if (link.length > METRIC_LINK_MAX) problems.link = METRIC_DEFINITION_MESSAGES.linkTooLong;
  else if (link && !METRIC_WEB_LINK.test(link)) problems.link = METRIC_DEFINITION_MESSAGES.linkNotWeb;
  if (values.howCounted.trim().length > METRIC_HOW_COUNTED_MAX) problems.howCounted = METRIC_DEFINITION_MESSAGES.howCountedTooLong;
  return problems;
}
