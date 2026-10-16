import { z } from "zod";

export const MEASUREMENT_METRIC_KEYS = ["conversion", "adoption", "error", "support", "csat", "duration", "events", "custom", "check", ""] as const;
export const MEASUREMENT_UNITS = ["percent", "count", "seconds", "minutes", ""] as const;
export type MeasurementMetricKey = typeof MEASUREMENT_METRIC_KEYS[number];
export type MeasurementUnit = typeof MEASUREMENT_UNITS[number];
export const MAX_MEASUREMENT_GUARDRAILS = 20;
export const MEASUREMENT_SCOPE_NAME_MAX = 100;
export const MEASUREMENT_METRIC_OPTIONS: { value: Exclude<MeasurementMetricKey, "">; label: string }[] = [
  { value: "conversion", label: "Conversion rate" },
  { value: "adoption", label: "Feature adoption rate" },
  { value: "error", label: "User error rate" },
  { value: "support", label: "Support contact rate" },
  { value: "csat", label: "Customer satisfaction (CSAT)" },
  { value: "duration", label: "Median time to convert" },
  { value: "events", label: "Action count" },
  { value: "custom", label: "Add custom metric…" },
  { value: "check", label: "Pass/fail check" },
];
export const GUARDRAIL_METRIC_OPTIONS = MEASUREMENT_METRIC_OPTIONS.filter(({ value }) => value !== "check");

const numberDraft = z.number().finite().nullable();
const metricFields = {
  key: z.enum(MEASUREMENT_METRIC_KEYS), name: z.string().max(120),
  unit: z.enum(MEASUREMENT_UNITS), current: numberDraft,
};
const primaryDraftSchema = z.object({
  ...metricFields, target: numberDraft, noBaseline: z.boolean(),
  check: z.enum(["keyboard", "required", "recovery", ""]),
});
const guardrailDraftSchema = z.object({
  ...metricFields, noBaseline: z.literal(false),
  operator: z.enum(["at_most", "at_least"]), limit: numberDraft,
});
export const measurementPlanDraftSchema = z.object({
  kind: z.literal("measurement"), version: z.literal(2),
  primary: primaryDraftSchema,
  measurement: z.object({
    audience: z.enum(["all", "new", "returning", "custom"]),
    audienceName: z.string().max(MEASUREMENT_SCOPE_NAME_MAX).optional(),
    platform: z.enum(["all", "web", "ios", "android", "custom"]),
    platformName: z.string().max(MEASUREMENT_SCOPE_NAME_MAX).optional(),
    windowDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]),
    exactDates: z.boolean(), startDate: z.string().max(10), endDate: z.string().max(10),
  }),
  guardrails: z.array(guardrailDraftSchema).max(MAX_MEASUREMENT_GUARDRAILS),
});
export type MeasurementPlanDraft = z.infer<typeof measurementPlanDraftSchema>;
export type MeasurementPrimaryDraft = MeasurementPlanDraft["primary"];
export type MeasurementGuardrailDraft = MeasurementPlanDraft["guardrails"][number];

export function measurementAudienceLabel(measurement: MeasurementPlanDraft["measurement"]): string {
  return measurement.audience === "custom" ? measurement.audienceName?.trim() || "Custom audience"
    : { all: "All users", new: "New users", returning: "Returning users" }[measurement.audience];
}
export function measurementPlatformLabel(measurement: MeasurementPlanDraft["measurement"]): string {
  return measurement.platform === "custom" ? measurement.platformName?.trim() || "Custom platform"
    : { all: "All platforms", web: "Web", ios: "iOS", android: "Android" }[measurement.platform];
}

export function measurementUnitLabel(unit: MeasurementUnit): string {
  return { percent: "%", count: "count", seconds: "seconds", minutes: "minutes", "": "Unit" }[unit];
}
export function measurementUnitOptions(key: MeasurementMetricKey): { value: Exclude<MeasurementUnit, "">; label: string }[] {
  if (key === "check" || key === "") return [];
  const all = [
    { value: "percent" as const, label: "Percentage (%)" }, { value: "count" as const, label: "Count" },
    { value: "seconds" as const, label: "Seconds" }, { value: "minutes" as const, label: "Minutes" },
  ];
  if (key === "custom") return all;
  if (key === "events") return all.filter(({ value }) => value === "count");
  if (key === "duration") return all.filter(({ value }) => value === "seconds" || value === "minutes");
  return all.filter(({ value }) => value === "percent" || value === "count");
}
export function measurementMetricLabel(metric: Pick<MeasurementPrimaryDraft, "key" | "name" | "unit">): string {
  if (metric.key === "custom") return metric.name.trim() || "Custom metric";
  if (metric.unit === "count") {
    const counts = { conversion: "Conversions", adoption: "Users who adopted", error: "Users with errors", support: "Users who contacted support", csat: "Satisfied responses" };
    if (metric.key in counts) return counts[metric.key as keyof typeof counts];
  }
  return MEASUREMENT_METRIC_OPTIONS.find(({ value }) => value === metric.key)?.label ?? "Choose metric";
}
export function createMeasurementPrimary(key: MeasurementMetricKey = ""): MeasurementPrimaryDraft {
  return { key, name: "", unit: key === "custom" || key === "check" || key === "" ? "" : key === "duration" ? "seconds" : key === "events" ? "count" : "percent", current: null, target: null, noBaseline: false, check: "" };
}
export function createMeasurementGuardrail(key: MeasurementMetricKey = ""): MeasurementGuardrailDraft {
  const { name, unit, current } = createMeasurementPrimary(key);
  return { key, name, unit, current, noBaseline: false, operator: "at_most", limit: null };
}
export function createEmptyMeasurementPlan(): MeasurementPlanDraft {
  return { kind: "measurement", version: 2, primary: createMeasurementPrimary(), measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 30, exactDates: false, startDate: "", endDate: "" }, guardrails: [] };
}

/** Unit changes never reinterpret 42 percent as 42 people. */
export function changeMetricUnit<T extends { unit: MeasurementUnit; current: number | null; target?: number | null; limit?: number | null }>(metric: T, unit: MeasurementUnit): T {
  if (metric.unit === unit) return { ...metric };
  const factor = metric.unit === "seconds" && unit === "minutes" ? 1 / 60 : metric.unit === "minutes" && unit === "seconds" ? 60 : null;
  const next = { ...metric, unit };
  for (const field of ["current", "target", "limit"] as const) {
    if (!(field in metric)) continue;
    const value = metric[field];
    next[field] = typeof value === "number" && factor !== null ? value * factor : null;
  }
  return next;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const measurementPlanSchema = measurementPlanDraftSchema.extend({
  // Optional fields preserve old snapshots exactly; only new custom values
  // need names. Draft text is trimmed only at the save/review boundary.
  measurement: measurementPlanDraftSchema.shape.measurement.extend({
    audienceName: z.string().trim().max(MEASUREMENT_SCOPE_NAME_MAX).optional(),
    platformName: z.string().trim().max(MEASUREMENT_SCOPE_NAME_MAX).optional(),
  }),
}).superRefine((plan, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  const validateMetric = (metric: MeasurementPrimaryDraft | MeasurementGuardrailDraft, path: (string | number)[], guardrail: boolean) => {
    if (!metric.key) issue([...path, "key"], "Choose a metric");
    if (metric.key === "check") {
      if (guardrail) issue([...path, "key"], "Choose a numeric guardrail metric");
      else if (!(metric as MeasurementPrimaryDraft).check) issue([...path, "check"], "Choose a pass/fail check");
      if (metric.unit !== "" || metric.current !== null || ("target" in metric && metric.target !== null) || metric.noBaseline) issue(path, "A pass/fail check does not use numeric values");
      return;
    }
    if (metric.key === "custom" && !metric.name.trim()) issue([...path, "name"], "Name the custom metric");
    if (!measurementUnitOptions(metric.key).some(({ value }) => value === metric.unit)) issue([...path, "unit"], "Choose a valid unit for this metric");
    if ("check" in metric && metric.check !== "") issue([...path, "check"], "A numeric metric cannot include a pass/fail check");
    for (const field of ["current", "target", "limit"] as const) {
      if (!(field in metric)) continue;
      const value = metric[field as keyof typeof metric];
      if (value === null) { if (field === "limit") issue([...path, field], "Enter a guardrail limit"); continue; }
      if (typeof value !== "number") continue;
      if (value < 0) issue([...path, field], "Enter zero or a positive number");
      if (metric.unit === "percent" && value > 100) issue([...path, field], "Enter a percentage from 0 to 100");
      if (metric.unit === "count" && !Number.isSafeInteger(value)) issue([...path, field], "Enter a whole number no larger than 9,007,199,254,740,991");
    }
    if (metric.noBaseline && metric.current !== null) issue([...path, "current"], "Clear the current value when there is no existing data");
  };
  validateMetric(plan.primary, ["primary"], false);
  plan.guardrails.forEach((guardrail, index) => validateMetric(guardrail, ["guardrails", index], true));
  if (plan.measurement.audience === "custom" && !plan.measurement.audienceName) issue(["measurement", "audienceName"], "Name the audience");
  if (plan.measurement.platform === "custom" && !plan.measurement.platformName) issue(["measurement", "platformName"], "Name the platform");
  if (plan.measurement.exactDates) {
    if (!validDate(plan.measurement.startDate)) issue(["measurement", "startDate"], "Enter a valid start date");
    if (!validDate(plan.measurement.endDate)) issue(["measurement", "endDate"], "Enter a valid end date");
    if (validDate(plan.measurement.startDate) && validDate(plan.measurement.endDate) && plan.measurement.endDate < plan.measurement.startDate) issue(["measurement", "endDate"], "End date must be on or after start date");
  }
});
export type MeasurementPlan = z.infer<typeof measurementPlanSchema>;

export function measurementRequestTypeIssue(impact: unknown, requestType: string | null | undefined): string | null {
  const parsed = measurementPlanDraftSchema.safeParse(impact);
  return parsed.success && parsed.data.primary.noBaseline && requestType !== "new_feature"
    ? "No existing data is only available for a New feature Request. Add current numbers or change the Request type."
    : null;
}
/** Legacy snapshots retain their original pickup policy. */
export function measurementReadiness(impact: unknown, requestType: string | null | undefined): string | null {
  if (!impact || typeof impact !== "object" || !("kind" in impact) || impact.kind !== "measurement") return null;
  const parsed = measurementPlanSchema.safeParse(impact);
  if (!parsed.success) return "Complete the measurement plan before picking up this Request.";
  const exceptionIssue = measurementRequestTypeIssue(parsed.data, requestType);
  if (exceptionIssue) return exceptionIssue;
  if (parsed.data.primary.key !== "check" && parsed.data.primary.current === null && !parsed.data.primary.noBaseline) return "Add the current value before picking up this Request.";
  if (parsed.data.guardrails.some((guardrail) => guardrail.current === null)) return "Add current values for every guardrail before picking up this Request.";
  return null;
}
