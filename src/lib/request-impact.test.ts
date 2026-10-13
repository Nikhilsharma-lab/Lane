import { describe, expect, it } from "vitest";
import { EMPTY_GUARDRAIL, EMPTY_METRIC_IMPACT, expectedImpactDraftSchema, expectedImpactSchema, formatGuardrail, hasGuardrailEdits, impactDraftState, impactSummaryLines, requiredExpectedImpactSchema } from "./request-impact";

const metric = { kind: "metric", metric: "Signup completion", baseline: null, target: 65, unit: "%", source: "Signup completed / signup started events", reviewAfterDays: 30 };
const verification = { kind: "verification", result: "Keyboard users can complete signup without a mouse", source: "Keyboard-only acceptance check on the released experience", reviewAfterDays: 7 };
const guardrail = { metric: "Error rate", operator: "at_most", limit: 2, unit: "%" };

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
  it.each([{ metric: " " }, { unit: " " }, { baseline: Infinity }, { metric: "a".repeat(121) }, { unit: "a".repeat(41) }, { source: "a".repeat(1001) }])("rejects invalid metric fields %j", (change) => {
    expect(expectedImpactSchema.safeParse({ ...metric, ...change }).success).toBe(false);
  });
  it.each([metric, verification])("reviews $kind impact without an evidence source", (impact) => {
    for (const source of [undefined, "", " \n "]) {
      const input = { ...impact, source };
      expect(expectedImpactSchema.parse(input)).toEqual({ ...impact, source: "" });
      expect(requiredExpectedImpactSchema.parse(input)).toEqual({ ...impact, source: "" });
    }
  });
  it.each([metric, verification])("preserves existing $kind evidence sources and their bounds", (impact) => {
    expect(expectedImpactSchema.parse(impact).source).toBe(impact.source);
    expect(requiredExpectedImpactSchema.parse(impact).source).toBe(impact.source);
    expect(expectedImpactDraftSchema.parse({ ...impact, source: ` ${impact.source} ` })?.source).toBe(` ${impact.source} `);
    expect(expectedImpactSchema.parse({ ...impact, source: ` ${impact.source} ` }).source).toBe(impact.source);
    expect(expectedImpactSchema.parse({ ...impact, source: "a".repeat(1000) }).source).toHaveLength(1000);
    for (const source of [null, 123, "a".repeat(1001)]) {
      expect(expectedImpactSchema.safeParse({ ...impact, source }).success).toBe(false);
      expect(requiredExpectedImpactSchema.safeParse({ ...impact, source }).success).toBe(false);
    }
  });
  it.each([metric, verification])("still requires valid review timing for source-less $kind impact", (impact) => {
    for (const reviewAfterDays of [undefined, null, 0, 1.5, 3651]) {
      const parsed = requiredExpectedImpactSchema.safeParse({ ...impact, source: undefined, reviewAfterDays });
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["reviewAfterDays"] }),
      ]));
    }
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

  it("defaults only new or missing draft units to percent", () => {
    expect(EMPTY_METRIC_IMPACT).toMatchObject({ kind: "metric", unit: "%" });
    expect(expectedImpactDraftSchema.parse({ kind: "metric" })).toMatchObject({ unit: "%" });
    for (const unit of ["", "ms", "USD"]) {
      expect(expectedImpactDraftSchema.parse({ kind: "metric", unit })).toMatchObject({ unit });
    }
  });

  it.each([metric, verification])("retains optional guardrails on $kind impact", (impact) => {
    expect(expectedImpactSchema.parse(impact)).toEqual(impact);
    expect(expectedImpactSchema.parse({ ...impact, guardrail })).toEqual({ ...impact, guardrail });
    expect(expectedImpactSchema.parse({ ...impact, guardrail: { ...guardrail, metric: " Error rate ", unit: " % " } })).toEqual({ ...impact, guardrail });
  });

  it.each([
    null, {}, { ...guardrail, metric: " " }, { ...guardrail, metric: "a".repeat(121) },
    { ...guardrail, operator: "equal" }, { ...guardrail, operator: undefined },
    { ...guardrail, limit: null }, { ...guardrail, limit: "2" },
    { ...guardrail, limit: NaN }, { ...guardrail, limit: Infinity }, { ...guardrail, limit: -Infinity },
    { ...guardrail, unit: " " }, { ...guardrail, unit: "a".repeat(41) },
  ])("rejects an incomplete or invalid added guardrail %#", (guardrail) => {
    expect(expectedImpactSchema.safeParse({ ...metric, guardrail }).success).toBe(false);
  });

  it.each([0, -2.5, 0.01])("allows finite guardrail limits %s in either direction", (limit) => {
    for (const operator of ["at_most", "at_least"]) {
      expect(expectedImpactSchema.parse({ ...metric, guardrail: { ...guardrail, operator, limit } })).toMatchObject({ guardrail: { operator, limit } });
    }
  });

  it("recovers partial guardrails without inventing a limit or replacing explicit units", () => {
    const draft = { ...metric, guardrail: { metric: "", operator: "at_most", limit: null, unit: "" } };
    expect(expectedImpactDraftSchema.parse(draft)).toEqual(draft);
    expect(expectedImpactSchema.safeParse(draft).success).toBe(false);
    expect(expectedImpactDraftSchema.parse({ ...verification, guardrail: {} })).toMatchObject({ guardrail: { metric: "", operator: "at_most", limit: null, unit: "" } });
    expect(EMPTY_GUARDRAIL).toEqual({ metric: "", operator: "at_most", limit: null, unit: "" });
    for (const unit of ["", "%", "requests per week"]) {
      expect(expectedImpactDraftSchema.parse({ ...metric, guardrail: { unit } })).toMatchObject({ guardrail: { unit } });
    }
  });

  it.each([metric, verification])("preserves pending guardrail edits and a complete cancel snapshot on $kind drafts", (impact) => {
    const draft = { ...impact, guardrail: { ...guardrail, limit: null, unit: "" }, guardrailEdit: { previous: guardrail } };
    expect(expectedImpactDraftSchema.parse(draft)).toEqual(draft);
    expect(expectedImpactDraftSchema.parse({ ...draft, guardrailEdit: { previous: null } })).toEqual({ ...draft, guardrailEdit: { previous: null } });
  });

  it.each([{}, { previous: {} }, { previous: { ...guardrail, limit: null } }])("rejects invalid guardrail cancel snapshots %#", (guardrailEdit) => {
    expect(expectedImpactDraftSchema.safeParse({ ...metric, guardrail, guardrailEdit }).success).toBe(false);
  });

  it.each([metric, verification])("requires explicit Add or Cancel before reviewing a valid $kind guardrail edit", (impact) => {
    const draft = { ...impact, guardrail, guardrailEdit: { previous: null } };
    const parsed = requiredExpectedImpactSchema.safeParse(draft);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["guardrailEdit"], message: "Add or cancel the guardrail before reviewing" }),
      ]));
    }
    expect(requiredExpectedImpactSchema.parse({ ...draft, guardrailEdit: undefined })).toEqual({ ...impact, guardrail });
    expect(expectedImpactSchema.parse(draft)).toEqual({ ...impact, guardrail });
  });

  it("keeps individual guardrail errors alongside the pending edit message", () => {
    const parsed = requiredExpectedImpactSchema.safeParse({ ...metric, guardrail: { ...guardrail, limit: null, unit: "" }, guardrailEdit: { previous: guardrail } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
        ["guardrailEdit"], ["guardrail", "limit"], ["guardrail", "unit"],
      ]));
    }
  });

  it("opens pending and legacy incomplete guardrails without treating committed guardrails as edits", () => {
    for (const impact of [null, undefined, { kind: "metric" as const }, { kind: "verification" as const, guardrail: { ...guardrail, operator: "at_most" as const } }]) {
      expect(hasGuardrailEdits(impact)).toBe(false);
    }
    for (const impact of [
      { kind: "metric" as const, guardrailEdit: { previous: null } },
      { kind: "verification" as const, guardrail: {} },
      { kind: "metric" as const, guardrail: { ...guardrail, operator: "at_most" as const, unit: "" } },
      { kind: "verification" as const, guardrail: { ...guardrail, operator: "at_most" as const }, guardrailEdit: { previous: null } },
    ]) {
      expect(hasGuardrailEdits(impact)).toBe(true);
    }
  });

  it.each([
    { metric: "Weekly support requests", operator: "at_most" as const, limit: 20, unit: "requests per week", expected: "Weekly support requests must stay at or below 20 requests per week." },
    { metric: "Signup completion", operator: "at_least" as const, limit: 0, unit: "%", expected: "Signup completion must stay at or above 0 %." },
  ])("formats the guardrail $operator threshold as an inclusive constraint", ({ expected, ...guardrail }) => {
    expect(formatGuardrail(guardrail)).toBe(expected);
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
