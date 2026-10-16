import { z } from "zod";
import { measurementPlanDraftSchema, measurementPlanSchema } from "./request-measurement";

export const IMPACT_METRIC_MAX = 120;
export const IMPACT_UNIT_MAX = 40;
export const IMPACT_SOURCE_MAX = 1000;
export const IMPACT_RESULT_MAX = 2000;
export const IMPACT_REVIEW_DAYS_MAX = 3650;
export const DEFAULT_IMPACT_UNIT = "%";

const metricName = z.string().trim().min(1, "Name the metric you expect to change").max(IMPACT_METRIC_MAX);
const unit = z.string().trim().min(1, "Add the unit for this metric").max(IMPACT_UNIT_MAX);
const source = z.string().trim().max(IMPACT_SOURCE_MAX).default("");
const result = z.string().trim().min(1, "Describe the result you expect to verify").max(IMPACT_RESULT_MAX);
const reviewDays = z.number("Choose when to check the result after launch").int("Use a whole number of days").min(1, "Review at least 1 day after launch").max(IMPACT_REVIEW_DAYS_MAX, "Review within 3,650 days after launch");
const guardrailOperator = z.enum(["at_most", "at_least"]);
export const guardrailSchema = z.object({
  metric: z.string().trim().min(1, "Name the guardrail metric").max(IMPACT_METRIC_MAX),
  operator: guardrailOperator,
  limit: z.number("Add a numeric guardrail limit"),
  unit,
});
const guardrailDraftSchema = z.object({
  metric: z.string().max(IMPACT_METRIC_MAX).default(""),
  operator: guardrailOperator.default("at_most"),
  limit: z.number().nullable().default(null),
  unit: z.string().max(IMPACT_UNIT_MAX).default(""),
});
export const EMPTY_GUARDRAIL: z.output<typeof guardrailDraftSchema> = { metric: "", operator: "at_most", limit: null, unit: "" };
// Current pane edits remain in guardrail; this draft-only snapshot lets Cancel
// restore the committed value even after the browser recovers a draft.
const guardrailEditSchema = z.object({ previous: guardrailSchema.nullable() });

export const expectedImpactSchema = z.discriminatedUnion("kind", [
  measurementPlanSchema,
  z.object({ kind: z.literal("metric"), metric: metricName, baseline: z.number().nullable(), target: z.number("Add a numeric target"), unit, source, reviewAfterDays: reviewDays, guardrail: guardrailSchema.optional() }),
  z.object({ kind: z.literal("verification"), result, source, reviewAfterDays: reviewDays, guardrail: guardrailSchema.optional() }),
]);
export type ExpectedImpact = z.infer<typeof expectedImpactSchema>;

export function formatGuardrail(guardrail: z.infer<typeof guardrailSchema>): string {
  return `${guardrail.metric} must stay at or ${guardrail.operator === "at_most" ? "below" : "above"} ${guardrail.limit} ${guardrail.unit}.`;
}

// Drafts are allowed to be incomplete. Empty numeric controls use null, never
// zero by coercion, so recovery cannot silently invent a target or baseline.
export const expectedImpactDraftSchema = z.discriminatedUnion("kind", [
  measurementPlanDraftSchema,
  z.object({ kind: z.literal("metric"), metric: z.string().max(IMPACT_METRIC_MAX).default(""), baseline: z.number().nullable().default(null), target: z.number().nullable().default(null), unit: z.string().max(IMPACT_UNIT_MAX).default(DEFAULT_IMPACT_UNIT), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null), guardrail: guardrailDraftSchema.optional(), guardrailEdit: guardrailEditSchema.optional() }),
  z.object({ kind: z.literal("verification"), result: z.string().max(IMPACT_RESULT_MAX).default(""), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null), guardrail: guardrailDraftSchema.optional(), guardrailEdit: guardrailEditSchema.optional() }),
]).nullish().transform((value) => value ?? null);
export type ExpectedImpactDraft = Exclude<z.output<typeof expectedImpactDraftSchema>, null>;
export const EMPTY_METRIC_IMPACT: Extract<ExpectedImpactDraft, { kind: "metric" }> = { kind: "metric", metric: "", baseline: null, target: null, unit: DEFAULT_IMPACT_UNIT, source: "", reviewAfterDays: null };

export function hasGuardrailEdits(impact: z.input<typeof expectedImpactDraftSchema>): boolean {
  if (impact?.kind === "measurement") return false;
  return Boolean(impact?.guardrailEdit || (impact?.guardrail && !guardrailSchema.safeParse(impact.guardrail).success));
}

/** Same permissive input type as the form; only a complete snapshot may pass. */
export const requiredExpectedImpactSchema = expectedImpactDraftSchema.transform((draft, context) => {
  if (draft === null) {
    context.addIssue({ code: "custom", message: "Add the expected impact before reviewing this Request" });
    return z.NEVER;
  }
  if (draft.kind === "measurement") {
    const parsed = measurementPlanSchema.safeParse(draft);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    return z.NEVER;
  }
  if (draft.guardrailEdit !== undefined) {
    context.addIssue({ code: "custom", path: ["guardrailEdit"], message: "Add or cancel the guardrail before reviewing" });
  }
  const parsed = expectedImpactSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    return z.NEVER;
  }
  if (draft.guardrailEdit !== undefined) return z.NEVER;
  return parsed.data;
});
