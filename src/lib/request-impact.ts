import { z } from "zod";
import { GUARDRAIL_OPERATORS, guardrailComparisonPhrase } from "./guardrail-comparison";
import { measurementPlanDraftSchema, measurementPlanSchema } from "./request-measurement";

export const IMPACT_METRIC_MAX = 120;
export const IMPACT_UNIT_MAX = 40;
export const IMPACT_SOURCE_MAX = 1000;
export const IMPACT_RESULT_MAX = 2000;
export const IMPACT_REVIEW_DAYS_MAX = 3650;
export const DEFAULT_IMPACT_UNIT = "%";
export const NO_MEASURABLE_IMPACT_REASON_MAX = 1000;

/** The "No measurable impact" choice: operational work, saved with its reason instead of a measured plan (#153). */
export const noMeasurableImpactSchema = z.object({
  kind: z.literal("no_measurable_impact"),
  reason: z.string().trim().min(1, "Say why this Request has no measurable impact").max(NO_MEASURABLE_IMPACT_REASON_MAX),
});
export type NoMeasurableImpact = z.infer<typeof noMeasurableImpactSchema>;

const metricName = z.string().trim().min(1, "Name the metric you expect to change").max(IMPACT_METRIC_MAX);
const unit = z.string().trim().min(1, "Add the unit for this metric").max(IMPACT_UNIT_MAX);
const source = z.string().trim().max(IMPACT_SOURCE_MAX).default("");
const result = z.string().trim().min(1, "Describe the result you expect to verify").max(IMPACT_RESULT_MAX);
const reviewDays = z.number("Choose when to check the result after launch").int("Use a whole number of days").min(1, "Review at least 1 day after launch").max(IMPACT_REVIEW_DAYS_MAX, "Review within 3,650 days after launch");
const guardrailOperator = z.enum(GUARDRAIL_OPERATORS);
export const guardrailSchema = z.object({
  metric: z.string().trim().min(1, "Name the guardrail metric").max(IMPACT_METRIC_MAX),
  operator: guardrailOperator,
  limit: z.number("Add a numeric guardrail limit"),
  unit,
  current: z.number().finite().nullable().optional(),
});
const guardrailDraftSchema = z.object({
  metric: z.string().max(IMPACT_METRIC_MAX).default(""),
  operator: guardrailOperator.default("at_most"),
  limit: z.number().nullable().default(null),
  unit: z.string().max(IMPACT_UNIT_MAX).default(""),
  current: z.number().finite().nullable().optional(),
});
export const EMPTY_GUARDRAIL: z.output<typeof guardrailDraftSchema> = { metric: "", operator: "at_most", limit: null, unit: "" };
// Current pane edits remain in guardrail; this draft-only snapshot lets Cancel
// restore the committed value even after the browser recovers a draft.
const guardrailEditSchema = z.object({ previous: guardrailSchema.nullable() });

// Optional additions in the existing JSON record; absent historical values stay
// absent. The original metric, units, evidence and review period remain intact.
const savedScopeDraft = measurementPlanDraftSchema.shape.measurement.omit({ windowDays: true }).extend({
  audience: z.enum(["", "all", "new", "returning", "custom"]),
  platform: z.enum(["", "all", "web", "ios", "android", "custom"]),
});
const savedScope = savedScopeDraft.superRefine((scope, context) => {
  const probe = measurementPlanSchema.safeParse({
    kind: "measurement", version: 2,
    primary: { key: "check", name: "", unit: "", current: null, target: null, noBaseline: false, check: "keyboard" },
    measurement: { ...scope, audience: scope.audience || "all", platform: scope.platform || "all", windowDays: 30 }, guardrails: [],
  });
  if (!probe.success) for (const issue of probe.error.issues) context.addIssue({ code: "custom", path: issue.path.slice(1), message: issue.message });
});
const savedExtras = { measurement: savedScope.optional(), noBaseline: z.boolean().optional(), additionalGuardrails: z.array(guardrailSchema).max(19).optional() };
const draftExtras = { measurement: savedScopeDraft.optional(), noBaseline: z.boolean().optional(), additionalGuardrails: z.array(guardrailDraftSchema).max(19).optional() };

export const expectedImpactSchema = z.discriminatedUnion("kind", [
  measurementPlanSchema,
  z.object({ kind: z.literal("metric"), metric: metricName, baseline: z.number().nullable(), target: z.number("Add a numeric target"), unit, source, reviewAfterDays: reviewDays, guardrail: guardrailSchema.optional(), ...savedExtras }),
  z.object({ kind: z.literal("verification"), result, source, reviewAfterDays: reviewDays, guardrail: guardrailSchema.optional(), ...savedExtras }),
]);
export type ExpectedImpact = z.infer<typeof expectedImpactSchema>;

// Historical Requests can have no completed impact. Save their partial edits
// separately; never weaken the Intake/completed-impact contract.
export const incompleteMeasurementSchema = expectedImpactSchema.options[1].extend({
  metric: z.union([metricName, z.literal("")]),
  unit: z.union([unit, z.literal("")]),
  target: z.number().finite().nullable(),
  reviewAfterDays: reviewDays.nullable(),
});
export type IncompleteMeasurement = z.infer<typeof incompleteMeasurementSchema>;


export function formatGuardrail(guardrail: z.infer<typeof guardrailSchema>): string {
  return `${guardrail.metric} must stay ${guardrailComparisonPhrase[guardrail.operator]} ${guardrail.limit} ${guardrail.unit}.`;
}

// Drafts are allowed to be incomplete. Empty numeric controls use null, never
// zero by coercion, so recovery cannot silently invent a target or baseline.
export const expectedImpactDraftSchema = z.discriminatedUnion("kind", [
  measurementPlanDraftSchema,
  z.object({ kind: z.literal("metric"), metric: z.string().max(IMPACT_METRIC_MAX).default(""), baseline: z.number().nullable().default(null), target: z.number().nullable().default(null), unit: z.string().max(IMPACT_UNIT_MAX).default(DEFAULT_IMPACT_UNIT), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null), guardrail: guardrailDraftSchema.optional(), guardrailEdit: guardrailEditSchema.optional(), ...draftExtras }),
  z.object({ kind: z.literal("verification"), result: z.string().max(IMPACT_RESULT_MAX).default(""), source: z.string().max(IMPACT_SOURCE_MAX).default(""), reviewAfterDays: z.number().nullable().default(null), guardrail: guardrailDraftSchema.optional(), guardrailEdit: guardrailEditSchema.optional(), ...draftExtras }),
  z.object({ kind: z.literal("no_measurable_impact"), reason: z.string().max(NO_MEASURABLE_IMPACT_REASON_MAX).default("") }),
]).nullish().transform((value) => value ?? null);
export type ExpectedImpactDraft = Exclude<z.output<typeof expectedImpactDraftSchema>, null>;
/** The saved-format drafts the measurement editor edits; the "No measurable impact" choice is edited on its own. */
export type PlanImpactDraft = Exclude<ExpectedImpactDraft, { kind: "no_measurable_impact" }>;
export const EMPTY_METRIC_IMPACT: Extract<ExpectedImpactDraft, { kind: "metric" }> = { kind: "metric", metric: "", baseline: null, target: null, unit: DEFAULT_IMPACT_UNIT, source: "", reviewAfterDays: null };

export function hasGuardrailEdits(impact: z.input<typeof expectedImpactDraftSchema>): boolean {
  if (impact?.kind === "measurement" || impact?.kind === "no_measurable_impact") return false;
  return Boolean(impact?.guardrailEdit || (impact?.guardrail && !guardrailSchema.safeParse(impact.guardrail).success));
}

/** Whether a draft holds the submitter's own work. The default unit is not
 * user work. An open guardrail pane, an added guardrail or an explicitly
 * cleared/custom unit is. Draft storage and the composer's disclosure share it. */
export function hasImpactWork(impact: z.input<typeof expectedImpactDraftSchema>): boolean {
  if (impact?.kind === "measurement") {
    const { primary, measurement, guardrails } = impact;
    return primary.key !== "" || primary.name.trim().length > 0 || primary.unit !== "" ||
      primary.current !== null || primary.target !== null || primary.noBaseline || primary.check !== "" ||
      guardrails.length > 0 || measurement.audience !== "all" || measurement.platform !== "all" ||
      Boolean(measurement.audienceName?.trim() || measurement.platformName?.trim()) ||
      measurement.windowDays !== 30 || measurement.exactDates ||
      Boolean(measurement.startDate || measurement.endDate);
  }
  if (impact?.kind === "no_measurable_impact") return true;
  return impact != null && (
    impact.guardrailEdit !== undefined ||
    impact.guardrail !== undefined ||
    (impact.kind === "metric" && impact.unit !== undefined && impact.unit !== DEFAULT_IMPACT_UNIT) ||
    Object.entries(impact).some(([key, value]) => key !== "kind" && key !== "unit" &&
      (typeof value === "number" || (typeof value === "string" && value.trim().length > 0)))
  );
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
  if (draft.kind === "no_measurable_impact") {
    const parsed = noMeasurableImpactSchema.safeParse(draft);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: ["reason"], message: issue.message });
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

/**
 * Expected impact for a new Request: a complete measurement plan only. The
 * Metric and Verified result kinds remain readable and editable on the older
 * Requests that saved them; nothing creates them any more (architecture
 * review I5, 2026-10-22).
 */
export const newRequestImpactSchema = requiredExpectedImpactSchema.superRefine((impact, context) => {
  if (impact.kind !== "measurement" && impact.kind !== "no_measurable_impact") context.addIssue({ code: "custom", message: "Choose what to measure for this Request" });
});

/** How much of the Expected impact draft is filled in, for the composer's
 * collapsed disclosure row (plan item 2.3, decision 8.26). "complete" means the
 * strict review schema accepts it, so an open guardrail edit is never complete;
 * any work hasImpactWork counts (not the default unit) makes it "partial". */
export type ImpactDraftState = "empty" | "partial" | "complete";

export function impactDraftState(draft: ExpectedImpactDraft | null | undefined): ImpactDraftState {
  if (!draft) return "empty";
  if (requiredExpectedImpactSchema.safeParse(draft).success) return "complete";
  return hasImpactWork(draft) ? "partial" : "empty";
}

function impactValue(value: number, unit: string) {
  const trimmed = unit.trim();
  return trimmed === "%" ? `${value}%` : `${value} ${trimmed}`;
}

/** The lines a complete Expected impact folds to: what changes, then when it is
 * checked (with the evidence source an older draft may still carry), then the
 * optional guardrail as its sentence. Each line is plain text; the composer
 * truncates it. Without a source the check reads as detail's "Check in". */
export function impactSummaryLines(impact: Exclude<ExpectedImpact, { kind: "measurement" }>): [string, string] | [string, string, string] {
  const first = impact.kind === "metric"
    ? impact.baseline === null
      ? `${impact.metric}, target ${impactValue(impact.target, impact.unit)}`
      : `${impact.metric}, ${impactValue(impact.baseline, impact.unit)} to ${impactValue(impact.target, impact.unit)}`
    : impact.result;
  const days = impact.reviewAfterDays === 1 ? "1 day" : `${impact.reviewAfterDays} days`;
  const source = impact.source.trim();
  const check = source ? `${source}, ${days} after launch` : `Check in ${days}`;
  return impact.guardrail ? [first, check, formatGuardrail(impact.guardrail)] : [first, check];
}

/**
 * What a Request's expected impact is, derived from its two stored columns (#153, spec #151 review). The database keeps
 * `expected_impact` and `no_measurable_impact_reason` as they are; every reader and writer of the pair goes through here.
 */
export type ImpactState<Plan = ExpectedImpact> =
  | { kind: "measured"; plan: Plan }
  | { kind: "operational"; reason: string }
  | { kind: "none" };

export function impactStateOf<Plan>(stored: { expectedImpact: Plan | null; noMeasurableImpactReason: string | null }): ImpactState<Plan> {
  if (stored.expectedImpact) return { kind: "measured", plan: stored.expectedImpact };
  if (stored.noMeasurableImpactReason) return { kind: "operational", reason: stored.noMeasurableImpactReason };
  return { kind: "none" };
}

/** The state a saved choice (a measured plan, or "No measurable impact" with its reason) stands for. */
export function impactStateOfChoice(choice: ExpectedImpact | NoMeasurableImpact | null | undefined): ImpactState {
  if (!choice) return { kind: "none" };
  return choice.kind === "no_measurable_impact" ? { kind: "operational", reason: choice.reason } : { kind: "measured", plan: choice };
}

/** The two columns a state is saved as. The only place the pair's values are written. */
export function impactColumnsOf<Plan>(state: ImpactState<Plan>): { expectedImpact: Plan | null; noMeasurableImpactReason: string | null } {
  if (state.kind === "measured") return { expectedImpact: state.plan, noMeasurableImpactReason: null };
  if (state.kind === "operational") return { expectedImpact: null, noMeasurableImpactReason: state.reason };
  return { expectedImpact: null, noMeasurableImpactReason: null };
}
