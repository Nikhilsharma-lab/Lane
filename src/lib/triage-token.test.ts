import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GOOD_SECRET = "a".repeat(64);
const WRONG_SECRET = "b".repeat(64);
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";

const input = {
  title: "Settings are hard to find",
  description: "People cannot find workspace settings when they need them.",
};

const triageResult = {
  classification: "solution" as const,
  reframedProblem: "People cannot find workspace settings when needed.",
  extractedSolution: null,
};

const context = { orgId: ORG_ID, userId: USER_ID };

describe("triage-token signing", () => {
  beforeEach(() => {
    vi.stubEnv("TRIAGE_TOKEN_SECRET", GOOD_SECRET);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("binds the trusted review state to a request, workspace, and person", async () => {
    const { createTriageToken, verifyTriageToken } = await import(
      "./triage-token"
    );
    const token = createTriageToken(input, triageResult, context);
    const verification = verifyTriageToken(token, context);

    expect(verification.valid).toBe(true);
    if (!verification.valid) return;

    expect(verification.payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(verification.payload.title).toBe(input.title);
    expect(verification.payload.description).toBe(input.description);
    expect(verification.payload.classification).toBe("solution");
    expect(verification.payload.extractedSolution).toBeNull();
    expect(verification.payload.orgId).toBe(ORG_ID);
    expect(verification.payload.userId).toBe(USER_ID);
  });

  it("rejects a token signed with a different secret", async () => {
    const { createTriageToken, verifyTriageToken } = await import(
      "./triage-token"
    );
    const token = createTriageToken(input, triageResult, context);

    vi.stubEnv("TRIAGE_TOKEN_SECRET", WRONG_SECRET);
    expect(verifyTriageToken(token, context)).toEqual({
      valid: false,
      reason: "invalid",
    });
  });

  it("rejects a valid token in a different workspace", async () => {
    const { createTriageToken, verifyTriageToken } = await import(
      "./triage-token"
    );
    const token = createTriageToken(input, triageResult, context);

    expect(
      verifyTriageToken(token, { ...context, orgId: OTHER_ORG_ID })
    ).toEqual({
      valid: false,
      reason: "context_mismatch",
    });
  });

  it("expires a review after ten minutes", async () => {
    const now = 1_800_000_000_000;
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    const { createTriageToken, verifyTriageToken } = await import(
      "./triage-token"
    );
    const token = createTriageToken(input, triageResult, context);

    dateNow.mockReturnValue(now + 10 * 60 * 1000 + 1);
    expect(verifyTriageToken(token, context)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("throws a loud error when TRIAGE_TOKEN_SECRET is unset", async () => {
    vi.stubEnv("TRIAGE_TOKEN_SECRET", "");
    const { createTriageToken } = await import("./triage-token");

    expect(() =>
      createTriageToken(input, triageResult, context)
    ).toThrowError("TRIAGE_TOKEN_SECRET is required");
  });
});
