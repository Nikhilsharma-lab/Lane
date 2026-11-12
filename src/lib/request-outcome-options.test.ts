import { describe, expect, it } from "vitest";
import { correctableFields } from "./request-outcome-options";

// #279 (story 41): Add correction offers only the parts this Request's closure has.
describe("the parts of a closure a Correction can change", () => {
  it("a measured closure with guardrails: its result, guardrails, evidence, observation and What we learned", () => {
    expect(correctableFields("measured", { guardrails: true })).toEqual(["actual", "guardrails", "evidence", "observation", "learned"]);
  });
  it("a measured closure with no guardrails never offers Guardrails", () => {
    expect(correctableFields("measured", { guardrails: false })).toEqual(["actual", "evidence", "observation", "learned"]);
  });
  it("a closure without a result: its reason and What we learned", () => {
    expect(correctableFields("exception", { guardrails: false })).toEqual(["reason", "learned"]);
  });
});
