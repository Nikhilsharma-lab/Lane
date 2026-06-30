import { describe, it, expect, vi, beforeEach } from "vitest";

const limitMock = vi.fn();

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    constructor() {}
    limit = limitMock;
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {}
  },
}));

describe("checkAiRateLimit", () => {
  beforeEach(() => {
    limitMock.mockReset();
    vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  });

  it("allows when under limit", async () => {
    limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60000 });

    const { checkAiRateLimit } = await import("@/lib/rate-limit");
    const result = await checkAiRateLimit("user-1");

    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
    expect(limitMock).toHaveBeenCalledWith("user-1");
  });

  it("rejects when over limit with retryAfterMs", async () => {
    const resetTime = Date.now() + 30000;
    limitMock.mockResolvedValue({ success: false, reset: resetTime });

    const { checkAiRateLimit } = await import("@/lib/rate-limit");
    const result = await checkAiRateLimit("user-2");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(30000);
  });

  it("fails open on Redis error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValue(new Error("Redis connection refused"));

    const { checkAiRateLimit } = await import("@/lib/rate-limit");
    const result = await checkAiRateLimit("user-3");

    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[rate-limit] Redis error — failing open:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
