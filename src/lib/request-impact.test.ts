import { describe, expect, it } from "vitest";
import { expectedImpactDraftSchema, expectedImpactSchema } from "./request-impact";

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
