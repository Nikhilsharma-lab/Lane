import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTriageToken, verifyTriageToken } from "@/lib/triage-token";

const boundary = vi.hoisted(() => ({
  session: { userId: "user_member", orgId: "org_a", orgRole: "org:member" },
  queries: [] as { sql: string; params: unknown[] }[],
  responses: [] as unknown[][][],
  aiCalls: 0,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => boundary.session }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("@/db/schema");
  return { ...schema, db: drizzle(async (sql, params) => {
    boundary.queries.push({ sql, params });
    return { rows: boundary.responses.shift() ?? [] };
  }, { schema }) };
});
vi.mock("@/lib/ai/triage", () => ({
  triageRequest: async () => { boundary.aiCalls += 1; return { classification: "problem", reframedProblem: null, extractedSolution: null }; },
  classifyTriageFailure: () => "provider",
}));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));

const PROJECT_ID = "00000000-0000-4000-a000-000000000001";
const input = { expectedImpact: { kind: "verification" as const, result: "Customers can compare all plans", source: "Released pricing acceptance check", reviewAfterDays: 7 }, title: "Pricing is confusing", description: "Customers cannot compare the available plans.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: PROJECT_ID, requestType: "bug" as const };
const triage = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };
const context = { orgId: "org_a", userId: "user_member" };

beforeEach(() => {
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "test-project-property-secret".repeat(3));
  boundary.queries = []; boundary.responses = []; boundary.aiCalls = 0;
  boundary.session = { userId: "user_member", orgId: "org_a", orgRole: "org:member" };
});

describe("Intake Project authorization", () => {
  it("rejects a nonexistent or foreign Project before spending an AI call", async () => {
    const { runTriage } = await import("./actions");
    const result = await runTriage(input, { orgId: "org_a" });
    expect(result).toMatchObject({ success: false, error: { code: "validation", field: "projectId" } });
    expect(boundary.aiCalls).toBe(0);
    expect(boundary.queries[0].params).toEqual(["org_a", PROJECT_ID, 1]);
  });
  it("binds an authorized Project and type in the returned review token", async () => {
    const { runTriage } = await import("./actions");
    boundary.responses = [[[PROJECT_ID]]];
    const result = await runTriage(input, { orgId: "org_a" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const verified = verifyTriageToken(result.token, context);
    expect(verified.valid && verified.payload).toMatchObject({ projectId: PROJECT_ID, requestType: "bug" });
  });
  it("revalidates Project access at save even with a valid signed token", async () => {
    const { saveRequest } = await import("./actions");
    const token = createTriageToken(input, triage, context);
    const result = await saveRequest({ token, editedProblemText: null }, { orgId: "org_a" });
    expect(result).toMatchObject({ success: false, error: { field: "projectId" } });
    expect(boundary.queries).toHaveLength(1);
    expect(boundary.queries[0].sql).not.toContain("insert");
  });
  it("saves only the signed metadata and server identity", async () => {
    const { saveRequest } = await import("./actions");
    const token = createTriageToken(input, triage, context);
    boundary.responses = [[[PROJECT_ID]], [["saved-request"]]];
    const result = await saveRequest({ token, editedProblemText: null, projectId: "forged", requestType: "urgent", userId: "forged" } as { token: string; editedProblemText: null }, { orgId: "org_a" });
    expect(result).toMatchObject({ success: true, requestId: "saved-request" });
    expect(boundary.queries[1].params).toContain(PROJECT_ID);
    expect(boundary.queries[1].params).toContain("bug");
    expect(boundary.queries[1].params).toContain("user_member");
    expect(boundary.queries[1].params).not.toContain("forged");
    expect(boundary.queries[1].params).not.toContain("urgent");
  });
  it("does not broaden Project visibility for guest triage", async () => {
    const { runTriage } = await import("./actions");
    boundary.session.orgRole = "org:guest";
    expect(await runTriage(input, { orgId: "org_a" })).toMatchObject({ success: false });
    expect(boundary.queries[0].sql).toContain('"requests"."created_by"');
    expect(boundary.queries[0].params).toEqual(["org_a", "user_member", "org_a", "user_member", PROJECT_ID, 1]);
  });
});
