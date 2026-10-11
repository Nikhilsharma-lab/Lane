import { describe, expect, it } from "vitest";
import { EMPTY_METRIC_IMPACT, expectedImpactDraftSchema, expectedImpactSchema, impactDraftState, impactSummaryLines } from "./request-impact";

const metric = { kind: "metric", metric: "Signup completion", baseline: null, target: 65, unit: "%", source: "Signup completed / signup started events", reviewAfterDays: 30 };
const verification = { kind: "verification", result: "Keyboard users can complete signup without a mouse", source: "Keyboard-only acceptance check on the released experience", reviewAfterDays: 7 };

describe("expected impact", () => {
  it("accepts an explicit target with no fabricated baseline", () => {
    expect(expectedImpactSchema.parse(metric)).toEqual(metric);
  });
  it("trims verification text and accepts observable success without a number", () => {
    expect(expectedImpactSchema.parse({ ...verification, result: `  ${verification.result}  ` })).toEqual(verification);
  });
  it.each([0, -1, 1.5, 3651, NaN, Infinity])("rejects invalid assessment window %s", (reviewAfterDays) => {
    expect(expectedImpactSchema.safeParse({ ...metric, reviewAfterDays }).success).toBe(false);
  });
  it.each(["65", null, NaN, Infinity, -Infinity])("rejects nonnumeric or missing target %s", (target) => {
    expect(expectedImpactSchema.safeParse({ ...metric, target }).success).toBe(false);
  });
  it.each([{ metric: " " }, { unit: " " }, { source: " " }, { baseline: Infinity }, { metric: "a".repeat(121) }, { unit: "a".repeat(41) }, { source: "a".repeat(1001) }])("rejects invalid metric fields %j", (change) => {
    expect(expectedImpactSchema.safeParse({ ...metric, ...change }).success).toBe(false);
  });
  it("allows zero, negative and decimal measurements with a defined unit", () => {
    expect(expectedImpactSchema.parse({ ...metric, baseline: -2.5, target: 0 })).toMatchObject({ target: 0 });
  });
  it("rejects empty or excessively long verification results", () => {
    expect(expectedImpactSchema.safeParse({ ...verification, result: " " }).success).toBe(false);
    expect(expectedImpactSchema.safeParse({ ...verification, result: "a".repeat(2001) }).success).toBe(false);
  });
  it("preserves partial drafts while strict review rejects them", () => {
    const draft = { ...metric, metric: "", target: null, reviewAfterDays: null };
    expect(expectedImpactDraftSchema.parse(draft)).toEqual(draft);
    expect(expectedImpactSchema.safeParse(draft).success).toBe(false);
    expect(expectedImpactDraftSchema.parse(undefined)).toBeNull();
  });
});

describe("Expected impact disclosure helpers (plan item 2.3)", () => {
  const emptyMetric = { kind: "metric" as const, metric: "", baseline: null, target: null, unit: "", source: "", reviewAfterDays: null };

  it("reads an absent or untouched draft as empty, whatever its kind", () => {
    expect(impactDraftState(null)).toBe("empty");
    expect(impactDraftState(undefined)).toBe("empty");
    expect(impactDraftState(EMPTY_METRIC_IMPACT)).toBe("empty");
    expect(impactDraftState({ kind: "verification", result: "  ", source: "", reviewAfterDays: null })).toBe("empty");
  });

  it("reads any typed text or number as partial until the strict schema accepts it", () => {
    expect(impactDraftState({ ...emptyMetric, metric: "Signup completion" })).toBe("partial");
    expect(impactDraftState({ ...emptyMetric, target: 0 })).toBe("partial");
    expect(impactDraftState({ ...metric, kind: "metric", reviewAfterDays: null })).toBe("partial");
    expect(impactDraftState({ ...metric, kind: "metric", reviewAfterDays: 0 })).toBe("partial");
  });

  it("reads a draft the strict schema accepts as complete", () => {
    expect(impactDraftState({ ...metric, kind: "metric" })).toBe("complete");
    expect(impactDraftState({ ...verification, kind: "verification" })).toBe("complete");
  });

  it("summarises a metric with a baseline as a change, with % joined and other units spaced", () => {
    expect(impactSummaryLines({ ...metric, kind: "metric", baseline: 62, target: 80 })).toEqual([
      "Signup completion, 62% to 80%",
      "Signup completed / signup started events, 30 days after launch",
    ]);
    expect(impactSummaryLines({ ...metric, kind: "metric", baseline: 420, target: 250, unit: "ms" })[0]).toBe("Signup completion, 420 ms to 250 ms");
  });

  it("summarises a metric with no baseline by its target alone", () => {
    expect(impactSummaryLines({ ...metric, kind: "metric" })[0]).toBe("Signup completion, target 65%");
    expect(impactSummaryLines({ ...metric, kind: "metric", target: -2.5, unit: "s" })[0]).toBe("Signup completion, target -2.5 s");
  });

  it("summarises a verified result by its criterion, and says 1 day in the singular", () => {
    expect(impactSummaryLines({ ...verification, kind: "verification", reviewAfterDays: 1 })).toEqual([
      "Keyboard users can complete signup without a mouse",
      "Keyboard-only acceptance check on the released experience, 1 day after launch",
    ]);
  });
});
