import * as z from "zod";

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

const MESSAGES = {
  nameMissing: "Give the metric a name.",
  nameTooLong: `Keep the name to ${METRIC_NAME_MAX} characters or fewer.`,
  unit: "Choose a unit.",
  linkTooLong: `Keep the link to ${METRIC_LINK_MAX} characters or fewer.`,
  linkNotWeb: "Enter a link that starts with https:// or http://.",
  howCountedTooLong: `Keep how it's counted to ${METRIC_HOW_COUNTED_MAX} characters or fewer.`,
};
const WEB_LINK = /^https?:\/\/\S+$/i;

/** Blank optional text is saved as nothing. */
const optionalText = (max: number, tooLong: string) => z.string().nullish()
  .transform(value => value?.trim() || null)
  .refine(value => value === null || value.length <= max, tooLong);

/**
 * What someone gives when adding or editing a Metric definition (#197). The server actions parse with it; the forms
 * check with `metricDefinitionProblems`, which gives the same answers without zod.
 */
export const metricDefinitionInputSchema = z.object({
  name: z.string({ error: MESSAGES.nameMissing }).trim().min(1, MESSAGES.nameMissing).max(METRIC_NAME_MAX, MESSAGES.nameTooLong),
  unit: z.enum(METRIC_UNITS, { error: MESSAGES.unit }),
  link: optionalText(METRIC_LINK_MAX, MESSAGES.linkTooLong)
    .refine(value => value === null || WEB_LINK.test(value), MESSAGES.linkNotWeb),
  howCounted: optionalText(METRIC_HOW_COUNTED_MAX, MESSAGES.howCountedTooLong),
});
export type MetricDefinitionInput = z.output<typeof metricDefinitionInputSchema>;

/** What adding a metric from the prediction form asks for (#199): the name, unit and generated definition. */
export const inlineMetricInputSchema = metricDefinitionInputSchema.pick({ name: true, unit: true, howCounted: true })
  .transform(({ name, unit, howCounted }) => ({ name: name.replace(/\s+/g, " "), unit, howCounted }));
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

/**
 * The forms' check of a definition as typed: the first problem with each field, the same as `metricDefinitionInputSchema`
 * gives (metric-definition-rules.test.ts holds them to it). Plain code, so the Metrics pages don't carry zod (#256).
 */
export function metricDefinitionProblems(values: { name: string; unit: string; link: string; howCounted: string }): Partial<Record<MetricDefinitionField, string>> {
  const problems: Partial<Record<MetricDefinitionField, string>> = {};
  const name = values.name.trim();
  if (!name) problems.name = MESSAGES.nameMissing;
  else if (name.length > METRIC_NAME_MAX) problems.name = MESSAGES.nameTooLong;
  if (!(METRIC_UNITS as readonly string[]).includes(values.unit)) problems.unit = MESSAGES.unit;
  const link = values.link.trim();
  if (link.length > METRIC_LINK_MAX) problems.link = MESSAGES.linkTooLong;
  else if (link && !WEB_LINK.test(link)) problems.link = MESSAGES.linkNotWeb;
  if (values.howCounted.trim().length > METRIC_HOW_COUNTED_MAX) problems.howCounted = MESSAGES.howCountedTooLong;
  return problems;
}
