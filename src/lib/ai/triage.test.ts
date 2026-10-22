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

import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { createTriage } from "./triage";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const answer = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });
const input = { title: "Add a dropdown", description: "Add a dropdown to the checkout page." };
const triageWith = (doGenerate: ConstructorParameters<typeof MockLanguageModelV3>[0] extends infer O ? O extends { doGenerate?: infer G } ? G : never : never, timeoutMs = 1_000) =>
  createTriage({ model: new MockLanguageModelV3({ doGenerate }), timeoutMs })(input);

describe("the AI check against a model", () => {
  it("returns the triage the model gives", async () => {
    const outcome = await triageWith(answer(JSON.stringify({ classification: "solution", reframedProblem: "Buyers can't choose a delivery slot at checkout.", extractedSolution: null })));
    expect(outcome).toEqual({ ok: true, triage: { classification: "solution", reframedProblem: "Buyers can't choose a delivery slot at checkout.", extractedSolution: null } });
  });
  it("says malformed for an answer that isn't the triage shape", async () => {
    expect(await triageWith(answer("not json"))).toMatchObject({ ok: false, kind: "malformed" });
    expect(await triageWith(answer(JSON.stringify({ classification: "hybrid", reframedProblem: "Buyers can't choose a slot.", extractedSolution: null })))).toMatchObject({ ok: false, kind: "malformed" });
  });
  it("gives up after the timeout and says so", async () => {
    const outcome = await triageWith(async ({ abortSignal }) => new Promise((_, reject) => {
      abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }), 20);
    expect(outcome).toMatchObject({ ok: false, kind: "timeout" });
  });
  it("names a provider limit, a provider failure and a lost connection, with the status for the log", async () => {
    const failing = (statusCode: number | undefined) => async () => {
      throw new APICallError({ message: "provider", url: "https://api.test", requestBodyValues: {}, statusCode, isRetryable: false });
    };
    expect(await triageWith(failing(429))).toMatchObject({ ok: false, kind: "rate_limited", status: 429 });
    expect(await triageWith(failing(529))).toMatchObject({ ok: false, kind: "provider", status: 529 });
    expect(await triageWith(failing(undefined))).toMatchObject({ ok: false, kind: "network", status: undefined });
  });
});
