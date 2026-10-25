import { z } from "zod";

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

/** Blank optional text is saved as nothing. */
const optionalText = (max: number, tooLong: string) => z.string().nullish()
  .transform(value => value?.trim() || null)
  .refine(value => value === null || value.length <= max, tooLong);

/** What someone gives when adding or editing a Metric definition (#197). The form and the actions share it. */
export const metricDefinitionInputSchema = z.object({
  name: z.string({ error: "Give the metric a name." }).trim().min(1, "Give the metric a name.").max(METRIC_NAME_MAX, `Keep the name to ${METRIC_NAME_MAX} characters or fewer.`),
  unit: z.enum(METRIC_UNITS, { error: "Choose a unit." }),
  link: optionalText(METRIC_LINK_MAX, `Keep the link to ${METRIC_LINK_MAX} characters or fewer.`)
    .refine(value => value === null || /^https?:\/\/\S+$/i.test(value), "Enter a link that starts with https:// or http://."),
  howCounted: optionalText(METRIC_HOW_COUNTED_MAX, `Keep how it's counted to ${METRIC_HOW_COUNTED_MAX} characters or fewer.`),
});
export type MetricDefinitionInput = z.output<typeof metricDefinitionInputSchema>;
export type MetricDefinitionField = keyof MetricDefinitionInput;

/** The first problem with each field, for showing beside it. */
export function metricDefinitionFieldErrors(error: z.ZodError): Partial<Record<MetricDefinitionField, string>> {
  const errors: Partial<Record<MetricDefinitionField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as MetricDefinitionField;
    errors[field] ??= issue.message;
  }
  return errors;
}
