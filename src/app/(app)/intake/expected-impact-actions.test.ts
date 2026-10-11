import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTriageToken } from "@/lib/triage-token";
const boundary = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], responses: [] as unknown[][][], aiInputs: [] as unknown[], session: { userId: "user_creator", orgId: "org_test", orgRole: "org:member" } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => boundary.session }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("@/db/schema");
  return { ...schema, db: drizzle(async (sql, params) => { boundary.queries.push({ sql, params }); return { rows: boundary.responses.shift() ?? [] }; }, { schema }) };
});
vi.mock("@/lib/ai/triage", () => ({ triageRequest: async (input: unknown) => { boundary.aiInputs.push(input); return { classification: "problem", reframedProblem: null, extractedSolution: null }; }, classifyTriageFailure: () => "provider" }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));
const impact = { kind: "metric" as const, metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 };
const input = { title: "Signup loses customers", description: "Customers abandon signup before finishing.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", expectedImpact: impact };
const triage = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };
const context = { orgId: "org_test", userId: "user_creator" };
const SECRET = "expected-impact-test-secret".repeat(3);
beforeEach(() => { vi.stubEnv("TRIAGE_TOKEN_SECRET", SECRET); boundary.queries = []; boundary.responses = []; boundary.aiInputs = []; });

describe("Expected impact server contract", () => {
  it("rejects missing or incomplete impact before an AI call", async () => {
    const { runTriage } = await import("./actions");
    for (const expectedImpact of [undefined, null, { ...impact, target: null }]) {
      expect(await runTriage({ ...input, expectedImpact }, { orgId: "org_test" })).toMatchObject({ success: false, error: { code: "validation", field: "expectedImpact" } });
    }
    expect(boundary.aiInputs).toHaveLength(0);
    expect(boundary.queries).toHaveLength(0);
  });
  it("does not ask AI to invent or evaluate the prediction", async () => {
    const { runTriage } = await import("./actions");
    expect(await runTriage(input, { orgId: "org_test" })).toMatchObject({ success: true });
    expect(boundary.aiInputs).toEqual([{ title: input.title, description: input.description }]);
  });
  it("saves the signed impact rather than forgeable action arguments", async () => {
    const { saveRequest } = await import("./actions");
    const token = createTriageToken(input, triage, context);
    boundary.responses = [[["saved-request"]]];
    const data = { token, editedProblemText: null, expectedImpact: { ...impact, target: 99 } };
    expect(await saveRequest(data, { orgId: "org_test" })).toMatchObject({ success: true, requestId: "saved-request" });
    expect(boundary.queries[0].params).toContain(JSON.stringify(impact));
    expect(boundary.queries[0].params).not.toContain(JSON.stringify(data.expectedImpact));
  });
  it("returns a recoverable impact validation for a correctly signed old review", async () => {
    const { saveRequest } = await import("./actions");
    const [current] = createTriageToken(input, triage, context).split(".");
    const payload = JSON.parse(Buffer.from(current, "base64url").toString()); delete payload.expectedImpact;
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
    expect(await saveRequest({ token: `${encoded}.${signature}`, editedProblemText: null }, { orgId: "org_test" })).toMatchObject({ success: false, error: { code: "validation", field: "expectedImpact" } });
    expect(boundary.queries).toHaveLength(0);
  });
  it("retains idempotent saves with the original request ID", async () => {
    const { saveRequest } = await import("./actions");
    const token = createTriageToken(input, triage, context);
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    boundary.responses = [[], [[payload.requestId]]];
    expect(await saveRequest({ token, editedProblemText: null }, { orgId: "org_test" })).toMatchObject({ success: true, requestId: payload.requestId });
    expect(boundary.queries[0].sql).toContain("on conflict");
    expect(boundary.queries[1].params).toEqual([payload.requestId, "org_test", "user_creator", 1]);
  });
});
