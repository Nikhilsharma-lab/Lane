import { afterEach, describe, expect, it, vi } from "vitest";
import { requestSchema } from "./request-schema";
import { readIntakeDraft, writeIntakeDraft } from "./intake-draft";
import { createTriageToken, verifyTriageToken } from "./triage-token";

const measurement = {
  kind: "measurement" as const, version: 2 as const,
  primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: null, target: 80, noBaseline: false, check: "" as const },
  measurement: { audience: "new" as const, platform: "web" as const, windowDays: 30 as const, exactDates: false, startDate: "", endDate: "" },
  guardrails: [{ key: "support" as const, name: "", unit: "count" as const, current: 0, noBaseline: false as const, operator: "at_most" as const, limit: 20 }],
};
const input = { title: "People cannot complete the flow", description: "People leave the flow when they are asked for an unnecessary detail.", projectId: null, requestType: "improvement" as const, priority: "high" as const, affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", expectedImpact: measurement };
const context = { orgId: "org_test", userId: "user_test" };
const triage = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };
afterEach(() => vi.unstubAllEnvs());

describe("measurement Intake boundaries", () => {
  it("allows creating with unknown current values and preserves the selected priority and complete measurement", () => {
    const result = requestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ priority: "high", expectedImpact: measurement });
  });
  it("rejects a no-data exception on an existing-feature Request", () => {
    const result = requestSchema.safeParse({ ...input, expectedImpact: { ...measurement, primary: { ...measurement.primary, noBaseline: true } } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path.join(".") === "expectedImpact.primary.noBaseline")).toBe(true);
  });
  it("recovers a measurement-only draft including incomplete guardrails and priority", () => {
    const store = new Map<string,string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
    const source = { ...input, title: "", description: "", expectedImpact: { ...measurement, guardrails: [{ ...measurement.guardrails[0], key: "" as const, limit: null }] } };
    writeIntakeDraft(storage, "person:workspace", { source, review: null }, 1000);
    expect(readIntakeDraft(storage, "person:workspace", 1001)?.source).toMatchObject({ priority: "high", expectedImpact: source.expectedImpact });
  });
  it("signs the complete measurement and rejects a changed guardrail or priority", () => {
    vi.stubEnv("TRIAGE_TOKEN_SECRET", "measurement-test-secret".repeat(4));
    const token = createTriageToken(input, triage, context);
    const verified = verifyTriageToken(token, context);
    expect(verified.valid && verified.payload).toMatchObject({ priority: "high", expectedImpact: measurement });
    const [encoded, signature] = token.split(".");
    for (const tamper of ["guardrail", "priority"]) {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
      if (tamper === "guardrail") payload.expectedImpact.guardrails[0].limit = 99;
      else payload.priority = "urgent";
      expect(verifyTriageToken(`${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`, context)).toEqual({ valid: false, reason: "invalid" });
    }
  });
});
