import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const GOOD_SECRET = "a".repeat(64);
const WRONG_SECRET = "b".repeat(64);

const triageResult = {
  classification: "solution" as const,
  reframedProblem: "Users can't find the settings page",
  extractedSolution: "Add a gear icon to the sidebar",
  qualityScore: 72,
  qualityFlags: ["No success criteria"],
  suggestions: ["Define what 'findable' means"],
};

describe("triage-token signing", () => {
  beforeEach(() => {
    vi.stubEnv("TRIAGE_TOKEN_SECRET", GOOD_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sign → verify roundtrip succeeds", async () => {
    const { createTriageToken, verifyTriageToken } = await import(
      "./triage-token"
    );
    const token = createTriageToken("Title", "Description text", triageResult);
    const payload = verifyTriageToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.title).toBe("Title");
    expect(payload!.description).toBe("Description text");
    expect(payload!.classification).toBe("solution");
    expect(payload!.extractedSolution).toBe("Add a gear icon to the sidebar");
  });

  it("rejects token signed with a different secret", async () => {
    const mod = await import("./triage-token");
    const token = mod.createTriageToken(
      "Title",
      "Description text",
      triageResult
    );

    vi.stubEnv("TRIAGE_TOKEN_SECRET", WRONG_SECRET);
    const freshMod = await import("./triage-token");
    const payload = freshMod.verifyTriageToken(token);

    expect(payload).toBeNull();
  });

  it("throws loud error when TRIAGE_TOKEN_SECRET is unset", async () => {
    vi.stubEnv("TRIAGE_TOKEN_SECRET", "");
    const { createTriageToken } = await import("./triage-token");

    expect(() =>
      createTriageToken("Title", "Desc", triageResult)
    ).toThrowError("TRIAGE_TOKEN_SECRET is required");
  });
});
