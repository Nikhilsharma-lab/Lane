import { z } from "zod";

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
  z.object({ kind: z.literal("metric"), metric: metricName, baseline: z.number().nullable(), target: z.number("Add a numeric target"), unit, source, reviewAfterDays: reviewDays, guardrail: guardrailSchema.optional() }),
  z.object({ kind: z.literal("verification"), result, source, reviewAfterDays: reviewDays, guardrail: guardrailSchema.optional() }),
]);
export type ExpectedImpact = z.infer<typeof expectedImpactSchema>;

export function formatGuardrail(guardrail: NonNullable<ExpectedImpact["guardrail"]>): string {
  return `${guardrail.metric} must stay at or ${guardrail.operator === "at_most" ? "below" : "above"} ${guardrail.limit} ${guardrail.unit}.`;
}

// Drafts are allowed to be incomplete. Empty numeric controls use null, never
// zero by coercion, so recovery cannot silently invent a target or baseline.
export const expectedImpactDraftSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("metric"), metric: z.string().max(IMPACT_METRIC_MAX).default(""), baseline: z.number().nullable().default(null), target: z.number().nullable().default(null), unit: z.string().max(IMPACT_UNIT_MAX).default(DEFAULT_IMPACT_UNIT), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null), guardrail: guardrailDraftSchema.optional(), guardrailEdit: guardrailEditSchema.optional() }),
  z.object({ kind: z.literal("verification"), result: z.string().max(IMPACT_RESULT_MAX).default(""), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null), guardrail: guardrailDraftSchema.optional(), guardrailEdit: guardrailEditSchema.optional() }),
]).nullish().transform((value) => value ?? null);
export type ExpectedImpactDraft = Exclude<z.output<typeof expectedImpactDraftSchema>, null>;
export const EMPTY_METRIC_IMPACT: ExpectedImpactDraft = { kind: "metric", metric: "", baseline: null, target: null, unit: DEFAULT_IMPACT_UNIT, source: "", reviewAfterDays: null };

export function hasGuardrailEdits(impact: z.input<typeof expectedImpactDraftSchema>): boolean {
  return Boolean(impact?.guardrailEdit || (impact?.guardrail && !guardrailSchema.safeParse(impact.guardrail).success));
}

/** Same permissive input type as the form; only a complete snapshot may pass. */
export const requiredExpectedImpactSchema = expectedImpactDraftSchema.transform((draft, context) => {
  if (draft === null) {
    context.addIssue({ code: "custom", message: "Add the expected impact before reviewing this Request" });
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

/** How much of the Expected impact draft is filled in, for the composer's
 * collapsed disclosure row (plan item 2.3, decision 8.26). "complete" means the
 * strict schema accepts it; any typed value or number makes it "partial". */
export type ImpactDraftState = "empty" | "partial" | "complete";

export function impactDraftState(draft: ExpectedImpactDraft | null | undefined): ImpactDraftState {
  if (!draft) return "empty";
  if (expectedImpactSchema.safeParse(draft).success) return "complete";
  const touched = Object.entries(draft).some(([key, value]) =>
    key !== "kind" && (typeof value === "number" || (typeof value === "string" && value.trim().length > 0)));
  return touched ? "partial" : "empty";
}

function impactValue(value: number, unit: string) {
  const trimmed = unit.trim();
  return trimmed === "%" ? `${value}%` : `${value} ${trimmed}`;
}

/** The two lines a complete Expected impact folds to: what changes, then how and
 * when it is checked. Each line is plain text; the composer truncates it. */
export function impactSummaryLines(impact: ExpectedImpact): [string, string] {
  const first = impact.kind === "metric"
    ? impact.baseline === null
      ? `${impact.metric}, target ${impactValue(impact.target, impact.unit)}`
      : `${impact.metric}, ${impactValue(impact.baseline, impact.unit)} to ${impactValue(impact.target, impact.unit)}`
    : impact.result;
  const days = impact.reviewAfterDays === 1 ? "1 day" : `${impact.reviewAfterDays} days`;
  return [first, `${impact.source}, ${days} after launch`];
}
