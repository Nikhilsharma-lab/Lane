import { afterEach, describe, expect, it, vi } from "vitest";

const { hookResponseHead } = vi.hoisted(() => ({ hookResponseHead: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ init: vi.fn(), captureRequestError: vi.fn() }));
vi.mock("@/lib/env", () => ({ reportServerEnv: vi.fn() }));
vi.mock("@/lib/request-timings", () => ({ hookResponseHead }));

describe("server start", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    hookResponseHead.mockClear();
  });

  it("hooks the response head before any page renders, so a new server's first page carries its timing steps", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("./instrumentation");
    await register();
    expect(hookResponseHead).toHaveBeenCalledOnce();
  });

  it("leaves the response head alone on the Edge runtime, which has no Node responses", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("./instrumentation");
    await register();
    expect(hookResponseHead).not.toHaveBeenCalled();
  });
});
