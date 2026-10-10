import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GOOD_SECRET = "a".repeat(64);
const WRONG_SECRET = "b".repeat(64);
const ORG_ID = "org_lane_test_a";
const USER_ID = "user_lane_test_a";
const OTHER_ORG_ID = "org_lane_test_b";

const impact = { kind: "metric" as const, metric: "Successful settings visits", baseline: 40, target: 60, unit: "%", source: "Product analytics", reviewAfterDays: 30 };

const input = {
  expectedImpact: impact,
  title: "Settings are hard to find",
  description: "People cannot find workspace settings when they need them.",
  affectedPeople: "Workspace members",
  desiredChange: "Settings should be easy to locate.",
  observedEvidence: "Two pilot users asked where Settings moved.",
  uncertainty: "A clearer navigation label may be enough.",
  usefulLink: "https://docs.example.com/settings-research",
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
    expect(verification.payload.observedEvidence).toBe(
      input.observedEvidence
    );
    expect(verification.payload.uncertainty).toBe(input.uncertainty);
    expect(verification.payload.classification).toBe("solution");
    expect(verification.payload.extractedSolution).toBeNull();
    expect(verification.payload.orgId).toBe(ORG_ID);
    expect(verification.payload.userId).toBe(USER_ID);
  });

  it("signs the selected project and request type", async () => {
    const { createTriageToken, verifyTriageToken } = await import("./triage-token");
    const properties = { projectId: "00000000-0000-4000-a000-000000000001", requestType: "improvement" as const };
    const token = createTriageToken({ ...input, ...properties }, triageResult, context);
    const result = verifyTriageToken(token, context);
    expect(result.valid && result.payload).toMatchObject(properties);
    const [encoded, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    payload.requestType = "bug";
    expect(verifyTriageToken(`${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`, context)).toEqual({ valid: false, reason: "invalid" });
  });

  it("accepts an older signed review with absent properties as null", async () => {
    const { createTriageToken, verifyTriageToken } = await import("./triage-token");
    const [current] = createTriageToken(input, triageResult, context).split(".");
    const payload = JSON.parse(Buffer.from(current, "base64url").toString());
    delete payload.projectId; delete payload.requestType;
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", GOOD_SECRET).update(encoded).digest("base64url");
    const result = verifyTriageToken(`${encoded}.${signature}`, context);
    expect(result.valid && result.payload).toMatchObject({ projectId: null, requestType: null });
  });

  it("binds expected impact to the signed review and rejects a changed target", async () => {
    const { createTriageToken, verifyTriageToken } = await import("./triage-token");
    const token = createTriageToken(input, triageResult, context);
    const result = verifyTriageToken(token, context);
    expect(result.valid && result.payload.expectedImpact).toEqual(impact);
    const [encoded, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    payload.expectedImpact = { ...impact, target: 95 };
    expect(verifyTriageToken(`${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`, context)).toEqual({ valid: false, reason: "invalid" });
  });

  it("requires a fresh review of old tokens missing expected impact", async () => {
    const { createTriageToken, verifyTriageToken } = await import("./triage-token");
    const [current] = createTriageToken(input, triageResult, context).split(".");
    const payload = JSON.parse(Buffer.from(current, "base64url").toString());
    delete payload.expectedImpact;
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", GOOD_SECRET).update(encoded).digest("base64url");
    expect(verifyTriageToken(`${encoded}.${signature}`, context)).toEqual({ valid: false, reason: "impact_required" });
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

  it("rejects a valid token for another Clerk user in the same workspace", async () => {
    const { createTriageToken, verifyTriageToken } = await import("./triage-token");
    const token = createTriageToken(input, triageResult, context);

    expect(verifyTriageToken(token, { ...context, userId: "user_lane_test_b" })).toEqual({
      valid: false,
      reason: "context_mismatch",
    });
  });

  it.each([
    { orgId: "", userId: USER_ID },
    { orgId: ORG_ID, userId: "" },
  ])("rejects a signed review missing identity: %j", async (missingIdentity) => {
    const { createTriageToken, verifyTriageToken } = await import("./triage-token");
    const token = createTriageToken(input, triageResult, missingIdentity);

    expect(verifyTriageToken(token, missingIdentity)).toEqual({
      valid: false,
      reason: "invalid",
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
