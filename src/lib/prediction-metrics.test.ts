import { describe, expect, it } from "vitest";
import type { MetricChoice } from "./metric-definition-rules";
import { expectedImpactDraftSchema, newRequestImpactSchema } from "./request-impact";
import { createEmptyMeasurementPlan, createMeasurementGuardrail, measurementMetricLabel, measurementPlanSchema, pickDefinition } from "./request-measurement";
import { upgradePlanMetrics } from "./request-measurement-editor";
import { savedMetricsOf } from "./saved-metrics";

// #198: predictions and guardrails pick a Metric definition; the plan keeps a reference plus a copy of
// the definition's name and unit at prediction time (saved-prediction version 5).
const SIGNUPS: MetricChoice = { id: "6f1c1f4e-6f8e-4b38-9c39-3f3b1f6f4a01", name: "Signups", unit: "count", link: null, howCounted: null, archived: false };
const ERRORS: MetricChoice = { id: "6f1c1f4e-6f8e-4b38-9c39-3f3b1f6f4a02", name: "User error rate", unit: "percent", link: "https://example.test/errors", howCounted: "Share of sessions with an error.", archived: false };

function v5() {
  const plan = createEmptyMeasurementPlan();
  plan.primary = { ...pickDefinition(plan.primary, SIGNUPS), current: 120, target: 150 };
  plan.guardrails = [{ ...pickDefinition(createMeasurementGuardrail(), ERRORS), current: 2, limit: 3 }];
  return plan;
}

describe("prediction v5", () => {
  it("starts new predictions on v5 and stores the definition reference with its name and unit", () => {
    expect(createEmptyMeasurementPlan().version).toBe(5);
    const plan = measurementPlanSchema.parse(v5());
    expect(plan.primary).toMatchObject({ key: "definition", definitionId: SIGNUPS.id, name: "Signups", unit: "count", current: 120, target: 150 });
    expect(plan.guardrails[0]).toMatchObject({ key: "definition", definitionId: ERRORS.id, name: "User error rate", unit: "percent", limit: 3 });
    expect(measurementMetricLabel(plan.primary)).toBe("Signups");
  });

  it("keeps the Pass/fail check as its own choice that names no definition", () => {
    const plan = { ...v5(), primary: { key: "check" as const, definitionId: null, name: "", unit: "" as const, current: null, target: null, noBaseline: false, check: "keyboard" as const } };
    expect(measurementPlanSchema.safeParse(plan).success).toBe(true);
    expect(measurementPlanSchema.safeParse({ ...plan, primary: { ...plan.primary, definitionId: SIGNUPS.id } }).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...v5(), guardrails: [{ ...v5().guardrails[0], key: "check" }] }).success).toBe(false);
  });

  it("refuses typed and built-in metrics in v5, and a metric without its reference", () => {
    for (const key of ["custom", "conversion"]) expect(measurementPlanSchema.safeParse({ ...v5(), primary: { ...v5().primary, key } }).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...v5(), primary: { ...v5().primary, definitionId: null } }).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...v5(), version: 4 }).success).toBe(false);
  });

  it("refuses a typed metric on a new Request", () => {
    const typed = { ...v5(), version: 4, primary: { ...v5().primary, key: "custom", definitionId: undefined, name: "Signups" }, guardrails: [] };
    expect(measurementPlanSchema.safeParse(typed).success).toBe(true);
    expect(newRequestImpactSchema.safeParse(typed).success).toBe(false);
    expect(newRequestImpactSchema.safeParse(v5()).success).toBe(true);
  });

  it("recovers a draft with its picked definitions", () => {
    const draft = { ...v5(), primary: { ...v5().primary, current: null } };
    expect(expectedImpactDraftSchema.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it("names the definition each v5 metric refers to", () => {
    expect(savedMetricsOf(v5()).map(({ position, savedName, ref }) => ({ position, savedName, ref }))).toEqual([
      { position: 0, savedName: "Signups", ref: { kind: "definition", id: SIGNUPS.id, unit: "count" } },
      { position: 1, savedName: "User error rate", ref: { kind: "definition", id: ERRORS.id, unit: "percent" } },
    ]);
  });
});

describe("editing an older plan", () => {
  const v4 = {
    ...createEmptyMeasurementPlan(), version: 4 as const,
    primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 10, target: 12, noBaseline: false, check: "" as const },
    guardrails: [{ key: "custom" as const, name: "Refunds", unit: "count" as const, current: null, noBaseline: false as const, operator: "at_most" as const, limit: 4 }],
  };
  const CONVERSION: MetricChoice = { ...SIGNUPS, id: "6f1c1f4e-6f8e-4b38-9c39-3f3b1f6f4a03", name: "Conversion rate", unit: "percent" };
  const REFUNDS: MetricChoice = { ...SIGNUPS, id: "6f1c1f4e-6f8e-4b38-9c39-3f3b1f6f4a04", name: "Refunds" };

  it("moves every metric onto the definition the library resolved it to, keeping the numbers", () => {
    const { plan, unresolved } = upgradePlanMetrics(v4, [CONVERSION, REFUNDS]);
    expect(unresolved).toEqual([]);
    expect(measurementPlanSchema.parse(plan)).toMatchObject({
      version: 5,
      primary: { key: "definition", definitionId: CONVERSION.id, name: "Conversion rate", unit: "percent", current: 10, target: 12 },
      guardrails: [{ key: "definition", definitionId: REFUNDS.id, name: "Refunds", unit: "count", operator: "at_most", limit: 4 }],
    });
  });

  it("asks for a metric again when the library has none for it, or its unit differs", () => {
    const { plan, unresolved } = upgradePlanMetrics(v4, [null, { ...REFUNDS, unit: "percent" }]);
    expect(unresolved).toEqual(["Conversion rate", "Refunds"]);
    expect(plan.primary).toMatchObject({ key: "", definitionId: null, current: null });
    expect(plan.guardrails[0]).toMatchObject({ key: "", definitionId: null, operator: "at_most", limit: null });
  });

  it("leaves a v5 plan as it is", () => {
    expect(upgradePlanMetrics(v5(), []).plan).toEqual(v5());
  });
});
