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
  triageRequest: async () => { boundary.aiCalls += 1; throw new Error("Illustrative provider failure"); },
  classifyTriageFailure: () => boundary.kind,
  triageFailureStatus: () => boundary.status,
}));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => boundary.limit }));

const input = { expectedImpact: { kind: "verification" as const, result: "Customers can compare all plans", source: "Released pricing acceptance check", reviewAfterDays: 7 }, title: "Pricing is confusing", description: "Customers cannot compare the available plans.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: null };

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
    expect(gateFailureNotice(thrownGateFailure(false))).toEqual({ tone: "warning", title: "You’re offline", body: "Your draft is kept. Check your connection and try again.", signIn: false });
  });

  it("names Lane's review limit with its wait", () => {
    expect(gateFailureNotice({ code: "rate_limited", message: "You’ve reached the review limit. Try again in 13 seconds.", retryAfterSeconds: 13 }))
      .toEqual({ tone: "warning", title: "Review limit reached", body: "You’ve reached the review limit. Try again in 13 seconds.", signIn: false });
  });

  it("asks for sign-in when the session ended, and keeps the draft", () => {
    expect(gateFailureNotice({ code: "session_expired", message: "Your session ended. Sign in again to continue this Request." }))
      .toEqual({ tone: "danger", title: "Your session ended", body: "Sign in again to continue. Your draft is kept.", signIn: true });
  });

  it("keeps a field's own sentence when the unavailable part is the Project check", () => {
    expect(gateFailureNotice({ code: "network", field: "projectId", message: "Lane could not check this Project. Try again." }).body).toBe("Lane could not check this Project. Try again.");
  });
});
