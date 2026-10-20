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
vi.mock("@/lib/ai/triage", () => ({ triageRequest: async (input: unknown) => { boundary.aiInputs.push(input); return { classification: "problem", reframedProblem: null, extractedSolution: null }; }, classifyTriageFailure: () => "provider", triageFailureStatus: () => undefined }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));
const impact = { kind: "metric" as const, metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 };
const input = { title: "Signup loses customers", description: "Customers abandon signup before finishing.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", expectedImpact: impact };
const triage = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };
const context = { orgId: "org_test", userId: "user_creator" };
const SECRET = "expected-impact-test-secret".repeat(3);
beforeEach(() => { vi.stubEnv("TRIAGE_TOKEN_SECRET", SECRET); boundary.queries = []; boundary.responses = []; boundary.aiInputs = []; boundary.session.orgRole="org:member"; });

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

  it("rejects a partial guardrail before spending an AI call", async () => {
    const { runTriage } = await import("./actions");
    const guardrail = { metric: "Error rate", operator: "at_most" as const, limit: null, unit: "%" };
    expect(await runTriage({ ...input, expectedImpact: { ...impact, guardrail } }, { orgId: "org_test" })).toMatchObject({ success: false, error: { code: "validation", field: "expectedImpact" } });
    expect(boundary.aiInputs).toHaveLength(0);
    expect(boundary.queries).toHaveLength(0);
  });

  it("saves the reviewed guardrail and ignores a replacement sent with the save", async () => {
    const { runTriage, saveRequest } = await import("./actions");
    const guardrail = { metric: "Error rate", operator: "at_most" as const, limit: 2, unit: "%" };
    const reviewedImpact = { ...impact, guardrail };
    const review = await runTriage({ ...input, expectedImpact: reviewedImpact }, { orgId: "org_test" });
    expect(review.success).toBe(true);
    if (!review.success) throw new Error("Expected a successful review");
    expect(boundary.aiInputs).toEqual([{ title: input.title, description: input.description }]);
    boundary.responses = [[["saved-request"]]];
    const data = { token: review.token, editedProblemText: null, expectedImpact: { ...reviewedImpact, guardrail: { ...guardrail, limit: 90 } } };
    expect(await saveRequest(data, { orgId: "org_test" })).toMatchObject({ success: true, requestId: "saved-request" });
    expect(boundary.queries[0].params).toContain(JSON.stringify(reviewedImpact));
    expect(boundary.queries[0].params).not.toContain(JSON.stringify(data.expectedImpact));
  });
});

it("reviews blank historical measurements only for an owned Open Request and cannot create with that token", async () => {
  const { runTriage, saveRequest } = await import("./actions");
  const requestId = "a1000000-0000-4000-8000-000000000016";
  boundary.responses = [[[requestId]]];
  const review = await runTriage({ ...input, expectedImpact: null }, { orgId: "org_test" }, requestId);
  expect(review.success).toBe(true);
  expect(boundary.queries[0].params).toEqual(expect.arrayContaining([requestId, "org_test", "user_creator", "open"]));
  if (!review.success) throw new Error("Expected existing Request review");
  boundary.queries = [];
  expect(await saveRequest({ token: review.token, editedProblemText: null }, { orgId: "org_test" })).toMatchObject({ success: false });
  expect(boundary.queries).toHaveLength(0);
});
it("refuses unavailable existing Requests before spending an AI call", async () => {
  const { runTriage } = await import("./actions");
  expect(await runTriage({ ...input, expectedImpact: null }, { orgId: "org_test" }, "a1000000-0000-4000-8000-000000000016")).toMatchObject({ success: false });
  expect(boundary.aiInputs).toHaveLength(0);
});

it("lets workspace admins review another creator's Open Request using session authority",async()=>{
 boundary.session.orgRole="org:admin";
 const requestId="a1000000-0000-4000-8000-000000000011";
 boundary.responses=[[[requestId]]];
 const {runTriage}=await import("./actions");
 expect(await runTriage(input,{orgId:"org_test"},requestId)).toMatchObject({success:true});
 expect(boundary.queries[0].params).not.toContain("user_creator");
 expect(boundary.queries[0].params).toEqual(expect.arrayContaining([requestId,"org_test","open"]));
});
