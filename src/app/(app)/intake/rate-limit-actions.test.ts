import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ limit: vi.fn(), triage: vi.fn() }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  limit = boundary.limit;
} }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@/lib/auth-guard", () => ({ requireActiveMember: async () => ({ userId: "session-user", orgId: "org-test", orgRole: "org:member" }) }));
vi.mock("@/lib/project-access", () => ({ canUseProject: async () => true }));
vi.mock("@/lib/ai/triage", () => ({ triageRequest: boundary.triage }));
vi.mock("@/db", async () => ({ ...(await import("@/db/schema")), db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const input = {
  title: "Customers cannot finish signup",
  description: "Customers abandon signup when the confirmation email does not arrive.",
  affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
  expectedImpact: { kind: "metric" as const, metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 },
};
const providerSuccess = () => ({ success: true, limit: 10, remaining: 9, reset: Date.now() + 60_000, pending: Promise.resolve() });
beforeEach(() => {
  vi.resetModules();
  boundary.limit.mockReset();
  boundary.triage.mockReset().mockResolvedValue({ ok: true, triage: { classification: "problem", reframedProblem: null, extractedSolution: null } });
  vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "triage-test-secret".repeat(3));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("AI provider admission", () => {
  it.each(["timeout", "error", "missing config"])("does not spend an AI call during %s and keeps the draft retryable", async (failure) => {
    if (failure === "timeout") boundary.limit.mockResolvedValue({ ...providerSuccess(), reason: "timeout" });
    if (failure === "error") boundary.limit.mockRejectedValue(new Error("Redis unavailable"));
    if (failure === "missing config") vi.stubEnv("KV_REST_API_TOKEN", "");
    const { runTriage } = await import("./actions");
    const result = await runTriage(input, { orgId: "org-test" });
    expect(result).toMatchObject({ success: false, error: { code: "network" } });
    if (!result.success) {
      expect(result.error.message).toContain("Your draft is kept.");
      expect(result.error.retryAfterSeconds).toBeUndefined();
    }
    expect(boundary.triage).not.toHaveBeenCalled();
  });
  it("preserves the quota countdown without making an AI call", async () => {
    boundary.limit.mockResolvedValue({ ...providerSuccess(), success: false, remaining: 0, reset: Date.now() + 30_000 });
    const { runTriage } = await import("./actions");
    expect(await runTriage(input, { orgId: "org-test" })).toMatchObject({ success: false, error: { code: "rate_limited", retryAfterSeconds: 30 } });
    expect(boundary.triage).not.toHaveBeenCalled();
  });
  it("can retry the same draft once the limiter recovers", async () => {
    boundary.limit.mockRejectedValueOnce(new Error("Redis unavailable")).mockResolvedValueOnce(providerSuccess());
    const { runTriage } = await import("./actions");
    expect(await runTriage(input, { orgId: "org-test" })).toMatchObject({ success: false });
    expect(await runTriage(input, { orgId: "org-test" })).toMatchObject({ success: true });
    expect(boundary.triage).toHaveBeenCalledTimes(1);
    expect(boundary.limit).toHaveBeenCalledWith("session-user");
  });
});
