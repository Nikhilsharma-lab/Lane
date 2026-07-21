import { describe, expect, it } from "vitest";

import { normalizeTriageOutput } from "./triage";

describe("Intake triage output boundary", () => {
  it("preserves original wording for a problem even if the model rewrites it", () => {
    expect(
      normalizeTriageOutput({
        classification: "problem",
        reframedProblem:
          "People cannot efficiently locate saved work after returning.",
        extractedSolution: null,
      })
    ).toEqual({
      classification: "problem",
      reframedProblem: null,
      extractedSolution: null,
    });
  });

  it("keeps the strict contract for solution and hybrid outcomes", () => {
    expect(() =>
      normalizeTriageOutput({
        classification: "hybrid",
        reframedProblem: "People cannot find saved work.",
        extractedSolution: null,
      })
    ).toThrow();
  });
});
