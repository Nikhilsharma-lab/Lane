import { describe, expect, it } from "vitest";
import { createEmptyMeasurementPlan, createMeasurementGuardrail, createMeasurementPrimary, measurementPlanSchema, measurementReadiness } from "./request-measurement";
import { expectedImpactSchema, formatGuardrail } from "./request-impact";
import { measurementEditorChanges, measurementEditorValue } from "./request-measurement-editor";

describe("guardrail thresholds without baselines", () => {
  it.each(["less_than", "greater_than", "equal_to", "at_most", "at_least"])("saves and reopens comparison %s without a current value", operator => {
    const value = {
      ...createEmptyMeasurementPlan(), version: 3,
      primary: { ...createMeasurementPrimary("conversion"), current: 25 },
      guardrails: [{ ...createMeasurementGuardrail("error"), operator, limit: 5 }],
    };
    const saved = expectedImpactSchema.parse(value);
    expect(measurementEditorChanges(measurementEditorValue(saved), saved)).toEqual(saved);
    expect(measurementReadiness(saved, "improvement")).toBeNull();
    expect(saved).toMatchObject({ guardrails: [{ operator, limit: 5, current: null }] });
  });
  it("does not require historical guardrail baselines but still requires the primary baseline", () => {
    const value = { ...createEmptyMeasurementPlan(), version: 2, primary: createMeasurementPrimary("conversion"), guardrails: [{ ...createMeasurementGuardrail("error"), limit: 5 }] };
    expect(measurementReadiness(value, "improvement")).toMatch(/current value/);
    expect(measurementReadiness({ ...value, primary: { ...value.primary, current: 0 } }, "improvement")).toBeNull();
  });
  it("rejects unknown comparisons and missing limits", () => {
    const value = { ...createEmptyMeasurementPlan(), primary: createMeasurementPrimary("conversion"), guardrails: [{ ...createMeasurementGuardrail("error"), operator: "approximately", limit: 5 }] };
    expect(measurementPlanSchema.safeParse(value).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...value, guardrails: [{ ...value.guardrails[0], operator: "at_most", limit: null }] }).success).toBe(false);
  });
  it.each([
    ["less_than", "less than"], ["greater_than", "greater than"], ["equal_to", "equal to"],
    ["at_most", "at or below"], ["at_least", "at or above"],
  ])("describes %s without reversing or rounding the boundary", (operator, phrase) => {
    const saved = expectedImpactSchema.parse({ kind: "metric", metric: "Conversion", baseline: 20, target: 30, unit: "%", source: "", reviewAfterDays: 30, guardrail: { metric: "Errors", operator, limit: 5, unit: "%" } });
    if (saved.kind === "measurement" || !saved.guardrail) throw new Error("Expected legacy guardrail");
    expect(formatGuardrail(saved.guardrail)).toBe(`Errors must stay ${phrase} 5 %.`);
  });
});

 it.each(["conversion", "adoption", "error", "support", "csat", "duration", "events", "custom"] as const)("supports four units for %s in v4 without rewriting v3", key => {
  for (const unit of ["percent", "count", "minutes", "seconds"] as const) {
    const plan = { ...createEmptyMeasurementPlan(), version: 4, primary: { ...createMeasurementPrimary(key), name: "Custom metric", unit, current: 2 }, guardrails: [{ ...createMeasurementGuardrail(key), name: "Custom metric", unit, limit: 3 }] };
    expect(measurementPlanSchema.safeParse(plan).success).toBe(true);
  }
  expect(measurementPlanSchema.safeParse({ ...createEmptyMeasurementPlan(), version: 3, primary: { ...createMeasurementPrimary("events"), unit: "seconds" } }).success).toBe(false);
});
