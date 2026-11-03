import * as z from "zod";
import {
  METRIC_DEFINITION_MESSAGES, METRIC_HOW_COUNTED_MAX, METRIC_LINK_MAX, METRIC_NAME_MAX, METRIC_UNITS, METRIC_WEB_LINK,
  type MetricDefinitionField,
} from "./metric-definition-rules";

/**
 * The server's parse of Metric definitions (#197, #199). Only the server actions import this file: the forms check
 * with `metricDefinitionProblems` (metric-definition-rules.ts), which gives the same answers without zod, so the
 * Metrics pages don't carry zod in their first load (#256).
 */

/** Blank optional text is saved as nothing. */
const optionalText = (max: number, tooLong: string) => z.string().nullish()
  .transform(value => value?.trim() || null)
  .refine(value => value === null || value.length <= max, tooLong);

/** What someone gives when adding or editing a Metric definition (#197). */
export const metricDefinitionInputSchema = z.object({
  name: z.string({ error: METRIC_DEFINITION_MESSAGES.nameMissing }).trim().min(1, METRIC_DEFINITION_MESSAGES.nameMissing).max(METRIC_NAME_MAX, METRIC_DEFINITION_MESSAGES.nameTooLong),
  unit: z.enum(METRIC_UNITS, { error: METRIC_DEFINITION_MESSAGES.unit }),
  link: optionalText(METRIC_LINK_MAX, METRIC_DEFINITION_MESSAGES.linkTooLong)
    .refine(value => value === null || METRIC_WEB_LINK.test(value), METRIC_DEFINITION_MESSAGES.linkNotWeb),
  howCounted: optionalText(METRIC_HOW_COUNTED_MAX, METRIC_DEFINITION_MESSAGES.howCountedTooLong),
});
export type MetricDefinitionInput = z.output<typeof metricDefinitionInputSchema>;

/** What adding a metric from the prediction form asks for (#199): the name, unit and generated definition. */
export const inlineMetricInputSchema = metricDefinitionInputSchema.pick({ name: true, unit: true, howCounted: true })
  .transform(({ name, unit, howCounted }) => ({ name: name.replace(/\s+/g, " "), unit, howCounted }));

/** The first problem with each field, for showing beside it. */
export function metricDefinitionFieldErrors(error: z.ZodError): Partial<Record<MetricDefinitionField, string>> {
  const errors: Partial<Record<MetricDefinitionField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as MetricDefinitionField;
    errors[field] ??= issue.message;
  }
  return errors;
}

