import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ limit: vi.fn(), initialize: vi.fn(), slidingWindow: vi.fn(() => ({})) }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = boundary.slidingWindow;
    constructor() { boundary.initialize(); }
    limit = boundary.limit;
  },
}));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
const allowed = () => ({ success: true, limit: 5, remaining: 4, reset: Date.now() + 60_000, pending: Promise.resolve() });
beforeEach(() => {
  vi.resetModules();
  boundary.limit.mockReset();
  boundary.initialize.mockReset();
  boundary.slidingWindow.mockClear();
  vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("checkAiRateLimit", () => {
  it("allows only a successful check and scopes it to the session user", async () => {
    boundary.limit.mockResolvedValue(allowed());
    const { checkAiRateLimit } = await import("./rate-limit");
    expect(await checkAiRateLimit("user-1")).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(boundary.limit).toHaveBeenCalledWith("user-1");
    expect(boundary.slidingWindow).toHaveBeenCalledWith(5, "60 s");
  });
  it("reports a real quota rejection separately from an outage", async () => {
    boundary.limit.mockResolvedValue({ ...allowed(), success: false, remaining: 0, reset: Date.now() + 30_000 });
    const { checkAiRateLimit } = await import("./rate-limit");
    const result = await checkAiRateLimit("user-1");
    expect(result).toMatchObject({ allowed: false, reason: "rate_limited" });
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(30_000);
  });
  it("rejects the SDK's fail-open timeout response even though success is true", async () => {
    boundary.limit.mockResolvedValue({ success: true, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve(), reason: "timeout" });
    const { checkAiRateLimit } = await import("./rate-limit");
    expect(await checkAiRateLimit("user-1")).toMatchObject({ allowed: false, reason: "unavailable" });
  });
  it("rejects Redis errors without leaking provider error details", async () => {
    boundary.limit.mockRejectedValue(new Error("PRIVATE_REDIS_TOKEN"));
    const { checkAiRateLimit } = await import("./rate-limit");
    expect(await checkAiRateLimit("user-1")).toMatchObject({ allowed: false, reason: "unavailable" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_REDIS_TOKEN");
  });
  it.each(["KV_REST_API_URL", "KV_REST_API_TOKEN"])("rejects missing %s before making a provider call", async (key) => {
    vi.stubEnv(key, "");
    const { checkAiRateLimit } = await import("./rate-limit");
    expect(await checkAiRateLimit("user-1")).toMatchObject({ allowed: false, reason: "unavailable" });
    expect(boundary.limit).not.toHaveBeenCalled();
  });
  it("returns a recoverable outage when limiter initialization fails", async () => {
    boundary.initialize.mockImplementation(() => { throw new Error("INVALID_CONFIG"); });
    const { checkAiRateLimit } = await import("./rate-limit");
    expect(await checkAiRateLimit("user-1")).toMatchObject({ allowed: false, reason: "unavailable" });
    expect(boundary.limit).not.toHaveBeenCalled();
  });
});
