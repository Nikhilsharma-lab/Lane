import { z } from "zod";

export const IMPACT_METRIC_MAX = 120;
export const IMPACT_UNIT_MAX = 40;
export const IMPACT_SOURCE_MAX = 1000;
export const IMPACT_RESULT_MAX = 2000;
export const IMPACT_REVIEW_DAYS_MAX = 3650;

const metricName = z.string().trim().min(1, "Name the metric you expect to change").max(IMPACT_METRIC_MAX);
const unit = z.string().trim().min(1, "Add the unit for this metric").max(IMPACT_UNIT_MAX);
const source = z.string().trim().min(1, "Describe how you will check the result").max(IMPACT_SOURCE_MAX);
const result = z.string().trim().min(1, "Describe the result you expect to verify").max(IMPACT_RESULT_MAX);
const reviewDays = z.number("Choose when to check the result after launch").int("Use a whole number of days").min(1, "Review at least 1 day after launch").max(IMPACT_REVIEW_DAYS_MAX, "Review within 3,650 days after launch");

export const expectedImpactSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("metric"), metric: metricName, baseline: z.number().nullable(), target: z.number("Add a numeric target"), unit, source, reviewAfterDays: reviewDays }),
  z.object({ kind: z.literal("verification"), result, source, reviewAfterDays: reviewDays }),
]);
export type ExpectedImpact = z.infer<typeof expectedImpactSchema>;

// Drafts are allowed to be incomplete. Empty numeric controls use null, never
// zero by coercion, so recovery cannot silently invent a target or baseline.
export const expectedImpactDraftSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("metric"), metric: z.string().max(IMPACT_METRIC_MAX).default(""), baseline: z.number().nullable().default(null), target: z.number().nullable().default(null), unit: z.string().max(IMPACT_UNIT_MAX).default(""), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null) }),
  z.object({ kind: z.literal("verification"), result: z.string().max(IMPACT_RESULT_MAX).default(""), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null) }),
]).nullish().transform((value) => value ?? null);
export type ExpectedImpactDraft = Exclude<z.output<typeof expectedImpactDraftSchema>, null>;
export const EMPTY_METRIC_IMPACT: ExpectedImpactDraft = { kind: "metric", metric: "", baseline: null, target: null, unit: "", source: "", reviewAfterDays: null };

/** Same permissive input type as the form; only a complete snapshot may pass. */
export const requiredExpectedImpactSchema = expectedImpactDraftSchema.transform((draft, context) => {
  if (draft === null) {
    context.addIssue({ code: "custom", message: "Add the expected impact before reviewing this Request" });
    return z.NEVER;
  }
  const parsed = expectedImpactSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    return z.NEVER;
  }
  return parsed.data;
});
