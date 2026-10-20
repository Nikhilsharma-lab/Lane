import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MeasurementPlanSummary } from "@/components/requests/measurement-plan-summary";
import { expectedImpactDraftSchema, expectedImpactSchema, requiredExpectedImpactSchema } from "./request-impact";
import { changeMetricUnit, createEmptyMeasurementPlan, createMeasurementGuardrail, createMeasurementPrimary, measurementMetricLabel, measurementPlanSchema, measurementReadiness, measurementRequestTypeIssue } from "./request-measurement";

const plan = {
  kind: "measurement", version: 2,
  primary: { key: "conversion", name: "", unit: "percent", current: null, target: null, noBaseline: false, check: "" },
  measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

describe("measurement contract at the existing intake boundary", () => {
  it("retains a measurement snapshot with unknown current and no invented target", () => {
    expect(expectedImpactSchema.parse(plan)).toEqual(plan);
    expect(requiredExpectedImpactSchema.parse(plan)).toEqual(plan);
  });
  it("recovers an unfinished measurement without making it saveable", () => {
    const unfinished = { ...plan, primary: { ...plan.primary, key: "", unit: "" } };
    expect(expectedImpactDraftSchema.parse(unfinished)).toEqual(unfinished);
    expect(requiredExpectedImpactSchema.safeParse(unfinished).success).toBe(false);
  });
});

describe("measurement values and pickup readiness", () => {
  it("accepts custom measurement scopes, trims their saved names and still requires current values", () => {
    const custom = { ...plan, measurement: { ...plan.measurement, audience: "custom", audienceName: "  Enterprise customers  ", platform: "custom", platformName: "  Desktop app  " } };
    const parsed = measurementPlanSchema.parse(custom);
    expect(parsed.measurement).toMatchObject({ audience: "custom", audienceName: "Enterprise customers", platform: "custom", platformName: "Desktop app" });
    expect(measurementReadiness(parsed, "improvement")).toMatch(/current value/);
    expect(measurementReadiness({ ...parsed, primary: { ...parsed.primary, current: 0 } }, "improvement")).toBeNull();
  });
  it("recovers unfinished custom scope names but does not allow saving unnamed scopes", () => {
    const draft = { ...plan, measurement: { ...plan.measurement, audience: "custom", audienceName: "", platform: "custom", platformName: "  " } };
    expect(expectedImpactDraftSchema.parse(draft)).toEqual(draft);
    const parsed = measurementPlanSchema.safeParse(draft);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map(issue => issue.path.join("."))).toEqual(expect.arrayContaining(["measurement.audienceName", "measurement.platformName"]));
  });
  it.each([undefined, "", "\t\n", "x".repeat(101), 23, null])("rejects an invalid custom audience or platform name: %s", (name) => {
    for (const scope of ["audience", "platform"] as const) {
      expect(measurementPlanSchema.safeParse({ ...plan, measurement: { ...plan.measurement, [scope]: "custom", [`${scope}Name`]: name } }).success).toBe(false);
    }
  });
  it("continues to accept historical preset scopes without adding new JSON fields", () => {
    const parsed = measurementPlanSchema.parse(plan);
    expect(parsed).toEqual(plan);
    expect(parsed.measurement).not.toHaveProperty("audienceName");
    expect(parsed.measurement).not.toHaveProperty("platformName");
  });
  it("shows custom scope names in the saved summary instead of blank or generic labels", () => {
    const parsed = measurementPlanSchema.parse({ ...plan, measurement: { ...plan.measurement, audience: "custom", audienceName: "Enterprise customers", platform: "custom", platformName: "Desktop <app>" } });
    const html = renderToStaticMarkup(createElement(MeasurementPlanSummary, { plan: parsed }));
    expect(html).toContain("Enterprise customers");
    expect(html).toContain("Desktop &lt;app&gt;");
    expect(html).not.toContain("All users");
    expect(html).not.toContain("All platforms");
  });
  it("allows saving missing values but blocks pickup until numeric current values are logged", () => {
    expect(measurementPlanSchema.safeParse(plan).success).toBe(true);
    expect(measurementReadiness(plan, "improvement")).toMatch(/current value/);
    expect(measurementReadiness({ ...plan, primary: { ...plan.primary, current: 0 } }, "improvement")).toBeNull();
  });
  it("allows only an explicit primary exception on a New feature", () => {
    const exception = { ...plan, primary: { ...plan.primary, noBaseline: true } };
    expect(measurementReadiness(plan, "new_feature")).not.toBeNull();
    expect(measurementReadiness(exception, "new_feature")).toBeNull();
    expect(measurementRequestTypeIssue(exception, "bug")).not.toBeNull();
    expect(measurementReadiness(exception, null)).not.toBeNull();
    expect(measurementPlanSchema.safeParse({ ...exception, primary: { ...exception.primary, current: 1 } }).success).toBe(false);
  });
  it("requires guardrail limits but no baseline with the primary exception", () => {
    const guarded = { ...plan, primary: { ...plan.primary, noBaseline: true }, guardrails: [{ ...createMeasurementGuardrail("support"), limit: 5 }] };
    expect(measurementPlanSchema.safeParse(guarded).success).toBe(true);
    expect(measurementReadiness(guarded, "new_feature")).toBeNull();
    expect(measurementReadiness({ ...guarded, guardrails: [{ ...guarded.guardrails[0], current: 0 }] }, "new_feature")).toBeNull();
    expect(measurementPlanSchema.safeParse({ ...guarded, guardrails: [{ ...guarded.guardrails[0], noBaseline: true }] }).success).toBe(false);
  });
  it.each([-1, 100.01, Infinity, NaN, "50"])("rejects invalid percentage observations %s", (current) => {
    expect(measurementPlanSchema.safeParse({ ...plan, primary: { ...plan.primary, current } }).success).toBe(false);
  });
  it.each([1.5, Number.MAX_SAFE_INTEGER + 1, -1])("rejects invalid counts %s", (current) => {
    expect(measurementPlanSchema.safeParse({ ...plan, primary: { ...plan.primary, unit: "count", current } }).success).toBe(false);
  });
  it("validates every target and guardrail limit without requiring a primary target", () => {
    expect(measurementPlanSchema.safeParse({ ...plan, primary: { ...plan.primary, target: 101 } }).success).toBe(false);
    for (const limit of [null, -1, 101]) {
      expect(measurementPlanSchema.safeParse({ ...plan, guardrails: [{ ...createMeasurementGuardrail("error"), limit }] }).success).toBe(false);
    }
  });
  it("requires a name and explicit unit for custom metrics", () => {
    const custom = { ...plan, primary: createMeasurementPrimary("custom") };
    expect(measurementPlanSchema.safeParse(custom).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...custom, primary: { ...custom.primary, name: "Orders", unit: "count" } }).success).toBe(true);
    expect(measurementPlanSchema.safeParse({ ...plan, primary: { ...plan.primary, unit: "seconds" } }).success).toBe(false);
  });
  it("allows a defined pass/fail check without invented numeric values", () => {
    const check = { ...plan, primary: { ...createMeasurementPrimary("check"), check: "keyboard" } };
    expect(measurementReadiness(check, "bug")).toBeNull();
    expect(measurementPlanSchema.safeParse({ ...check, primary: { ...check.primary, current: 0 } }).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...check, primary: { ...check.primary, check: "" } }).success).toBe(false);
  });
  it("accepts ordered real exact dates and rejects impossible or partial ones", () => {
    const exact = { ...plan.measurement, exactDates: true, startDate: "2028-02-29", endDate: "2028-03-01" };
    expect(measurementPlanSchema.safeParse({ ...plan, measurement: exact }).success).toBe(true);
    for (const change of [{ startDate: "2026-02-29" }, { endDate: "2028-02-28" }, { endDate: "" }, { startDate: "0000-01-01" }]) {
      expect(measurementPlanSchema.safeParse({ ...plan, measurement: { ...exact, ...change } }).success).toBe(false);
    }
  });
  it("converts duration values together and clears incompatible values", () => {
    const seconds = { ...createMeasurementPrimary("duration"), current: 120, target: 60 };
    expect(changeMetricUnit(seconds, "minutes")).toMatchObject({ unit: "minutes", current: 2, target: 1 });
    const count = { ...createMeasurementGuardrail("custom"), unit: "seconds" as const, current: 30, limit: 120 };
    expect(changeMetricUnit(count, "minutes")).toMatchObject({ current: 0.5, limit: 2 });
    expect(changeMetricUnit(count, "percent")).toMatchObject({ current: null, limit: null });
    expect(changeMetricUnit({ ...createMeasurementPrimary("conversion"), current: 50, target: 75 }, "count")).toMatchObject({ current: null, target: null });
  });
  it("changes rate labels when the user chooses counts and creates isolated drafts", () => {
    expect(measurementMetricLabel({ key: "conversion", name: "", unit: "count" })).toBe("Conversions");
    expect(measurementMetricLabel({ key: "custom", name: "  Orders  ", unit: "count" })).toBe("Orders");
    const first = createEmptyMeasurementPlan();
    first.guardrails.push(createMeasurementGuardrail("error"));
    first.measurement.platform = "web";
    expect(createEmptyMeasurementPlan()).toMatchObject({ guardrails: [], measurement: { platform: "all" } });
  });
  it("keeps historical null and expected-impact pickup behavior", () => {
    expect(measurementReadiness(null, null)).toBeNull();
    expect(measurementReadiness({ kind: "metric", baseline: null }, "bug")).toBeNull();
  });
});
