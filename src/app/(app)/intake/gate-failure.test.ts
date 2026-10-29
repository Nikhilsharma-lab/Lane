import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateFailureNotice, thrownGateFailure } from "./gate-failure";

const boundary = vi.hoisted(() => ({
  kind: "provider" as string,
  status: undefined as number | undefined,
  limit: { allowed: true } as { allowed: true } | { allowed: false; retryAfterMs: number },
  aiCalls: 0,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_member", orgId: "org_a", orgRole: "org:member" }) }));
vi.mock("@/db", () => ({ db: {}, requests: {} }));
vi.mock("@/lib/ai/triage", () => ({
  triageRequest: async () => { boundary.aiCalls += 1; return { ok: false, kind: boundary.kind, status: boundary.status, error: new Error("Illustrative provider failure") }; },
}));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => boundary.limit }));
// No database here: the Metrics library check (#198) passes the prediction through.
vi.mock("@/lib/metrics-library", () => ({ checkPredictionMetrics: async (_workspace: unknown, impact: unknown) => ({ impact }) }));

const input = { expectedImpact: { kind: "measurement" as const, version: 2 as const, primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 80, noBaseline: false, check: "" as const }, measurement: { audience: "all" as const, platform: "web" as const, windowDays: 30 as const, exactDates: false, startDate: "", endDate: "" }, guardrails: [] }, title: "Pricing is confusing", description: "Customers cannot compare the available plans.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: null };

beforeEach(() => {
  boundary.kind = "provider"; boundary.status = undefined; boundary.limit = { allowed: true }; boundary.aiCalls = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("AI gate failures on the server (plan item 2.3)", () => {
  it.each(["timeout", "malformed", "network", "provider"])("a %s failure keeps its kind and says the review is unavailable", async (kind) => {
    boundary.kind = kind;
    const { runTriage } = await import("./actions");
    const result = await runTriage(input, { orgId: "org_a" });
    expect(result).toEqual({ success: false, error: { code: kind, message: "Review unavailable right now. Your draft is kept." } });
  });

  it("answers a provider 429 as the provider, so rate_limited only ever means Lane's limiter", async () => {
    boundary.kind = "rate_limited";
    boundary.status = 429;
    const { runTriage } = await import("./actions");
    const result = await runTriage(input, { orgId: "org_a" });
    expect(result).toEqual({ success: false, error: { code: "provider", message: "Review unavailable right now. Your draft is kept." } });
    expect(console.error).toHaveBeenCalledWith("[intake] triage failed:", expect.objectContaining({ kind: "rate_limited", statusCode: 429 }));
  });

  it("keeps Lane's own limit as rate_limited, with its wait, and spends no AI call", async () => {
    boundary.limit = { allowed: false, retryAfterMs: 12_400 };
    const { runTriage } = await import("./actions");
    const result = await runTriage(input, { orgId: "org_a" });
    expect(result).toEqual({ success: false, error: { code: "rate_limited", message: "You’ve reached the review limit. Try again in 13 seconds.", retryAfterSeconds: 13 } });
    expect(boundary.aiCalls).toBe(0);
  });
});

describe("AI gate failures in the composer (plan item 2.3)", () => {
  const unavailable = { tone: "warning", title: "Review unavailable right now", body: "Your draft is kept.", signIn: false };

  it.each(["timeout", "network", "provider", "malformed"] as const)("shows a %s failure as the review being unavailable", (code) => {
    expect(gateFailureNotice({ code, message: "Review unavailable right now. Your draft is kept." })).toEqual(unavailable);
  });

  it("shows a throw while online as unavailable and a throw while offline as offline", () => {
    expect(gateFailureNotice(thrownGateFailure(true))).toEqual(unavailable);
    expect(gateFailureNotice(thrownGateFailure(false))).toEqual({ tone: "warning", title: "You’re offline", body: "You're offline, this will work when you're back. Your draft is kept.", signIn: false });
  });

  it("names Lane's review limit with its wait", () => {
    expect(gateFailureNotice({ code: "rate_limited", message: "You’ve reached the review limit. Try again in 13 seconds.", retryAfterSeconds: 13 }))
      .toEqual({ tone: "warning", title: "Review limit reached", body: "You’ve reached the review limit. Try again in 13 seconds.", signIn: false });
  });

  it("asks for sign-in when the session ended, and keeps the draft", () => {
    expect(gateFailureNotice({ code: "session_expired", message: "Your session ended. Sign in again to continue this Request." }))
      .toEqual({ tone: "danger", title: "Your session ended", body: "Sign in again to continue. Your draft is kept.", signIn: true });
  });

  it("says an Admin needs to pay once the Free Requests are used (#213), and keeps the draft", () => {
    const message = "This workspace has used its 4 Free Requests. An Admin needs to pay for Lane before anyone here can create a new Request or take on a Guest submission. Everything already filed keeps working.";
    expect(gateFailureNotice({ code: "billing_blocked", message }))
      .toEqual({ tone: "warning", title: "An Admin needs to pay", body: `${message} Your draft is kept.`, signIn: false });
  });

  it("keeps a field's own sentence when the unavailable part is the Project check", () => {
    expect(gateFailureNotice({ code: "network", field: "projectId", message: "Lane couldn't check this Project. Try again." }).body).toBe("Lane couldn't check this Project. Try again.");
  });
});
