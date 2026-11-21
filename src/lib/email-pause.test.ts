import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ keys: new Set<string>(), set: vi.fn(), exists: vi.fn(), initialize: vi.fn() }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() { boundary.initialize(); }
    set = boundary.set;
    exists = boundary.exists;
  },
}));
beforeEach(() => {
  vi.resetModules();
  boundary.keys.clear();
  boundary.set.mockReset().mockImplementation(async (key: string) => { boundary.keys.add(key); return "OK"; });
  boundary.exists.mockReset().mockImplementation(async (key: string) => (boundary.keys.has(key) ? 1 : 0));
  boundary.initialize.mockReset();
  vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("emailPause.pause", () => {
  it.each([
    ["just after midnight", "2026-11-21T00:00:01.000Z", "2026-11-22T00:00:00.000Z"],
    ["mid-day", "2026-11-21T12:34:56.789Z", "2026-11-22T00:00:00.000Z"],
    ["one second before midnight", "2026-11-21T23:59:59.000Z", "2026-11-22T00:00:00.000Z"],
    ["the last day of a year", "2026-12-31T18:00:00.000Z", "2027-01-01T00:00:00.000Z"],
  ])("sets one lane: key that expires at the next 00:00 UTC (%s)", async (_label, now, end) => {
    const { emailPause } = await import("./email-pause");
    await emailPause.pause(new Date(now));
    expect(boundary.set).toHaveBeenCalledTimes(1);
    const [key, , options] = boundary.set.mock.calls[0];
    expect(key).toMatch(/^lane:/);
    expect(options).toEqual({ pxat: Date.parse(end) });
  });
  it("logs one line saying Inbox email is paused for the day", async () => {
    const { emailPause } = await import("./email-pause");
    await emailPause.pause(new Date("2026-11-21T12:00:00.000Z"));
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith("[email-pause] Inbox email is paused for the rest of the UTC day");
    expect(console.error).not.toHaveBeenCalled();
  });
  it.each(["KV_REST_API_URL", "KV_REST_API_TOKEN"])("logs once and resolves when %s is missing, without a provider call", async (key) => {
    vi.stubEnv(key, "");
    const { emailPause } = await import("./email-pause");
    await expect(emailPause.pause(new Date())).resolves.toBeUndefined();
    expect(boundary.set).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.info).not.toHaveBeenCalled();
  });
  it("logs once and resolves when the client rejects, without leaking provider details", async () => {
    boundary.set.mockRejectedValue(new Error("PRIVATE_REDIS_TOKEN"));
    const { emailPause } = await import("./email-pause");
    await expect(emailPause.pause(new Date())).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.info).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_REDIS_TOKEN");
  });
  it("logs once and resolves when client initialization throws", async () => {
    boundary.initialize.mockImplementation(() => { throw new Error("INVALID_CONFIG"); });
    const { emailPause } = await import("./email-pause");
    await expect(emailPause.pause(new Date())).resolves.toBeUndefined();
    expect(boundary.set).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe("createInMemoryEmailPause", () => {
  it("holds a pause from the moment it is recorded until the next 00:00 UTC, without reaching Upstash", async () => {
    const { createInMemoryEmailPause } = await import("./email-pause");
    const pause = createInMemoryEmailPause();
    expect(await pause.isPaused(new Date("2026-11-21T12:00:00.000Z"))).toBe(false);
    await pause.pause(new Date("2026-11-21T12:00:00.000Z"));
    expect(await pause.isPaused(new Date("2026-11-21T12:00:00.000Z"))).toBe(true);
    expect(await pause.isPaused(new Date("2026-11-21T23:59:59.000Z"))).toBe(true);
    expect(await pause.isPaused(new Date("2026-11-22T00:00:00.000Z"))).toBe(false);
    expect(boundary.initialize).not.toHaveBeenCalled();
  });
  it("keeps each fake's pause to itself", async () => {
    const { createInMemoryEmailPause } = await import("./email-pause");
    const first = createInMemoryEmailPause();
    await first.pause(new Date("2026-11-21T12:00:00.000Z"));
    expect(await createInMemoryEmailPause().isPaused(new Date("2026-11-21T12:00:00.000Z"))).toBe(false);
  });
});

describe("emailPause.isPaused", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");
  it("is false when no pause key exists", async () => {
    const { emailPause } = await import("./email-pause");
    expect(await emailPause.isPaused(now)).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });
  it("is true after a pause", async () => {
    const { emailPause } = await import("./email-pause");
    await emailPause.pause(now);
    expect(await emailPause.isPaused(now)).toBe(true);
  });
  it.each(["KV_REST_API_URL", "KV_REST_API_TOKEN"])("answers paused and logs once when %s is missing", async (key) => {
    vi.stubEnv(key, "");
    const { emailPause } = await import("./email-pause");
    expect(await emailPause.isPaused(now)).toBe(true);
    expect(boundary.exists).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
  it("answers paused and logs once when the client rejects, without leaking provider details", async () => {
    boundary.exists.mockRejectedValue(new Error("PRIVATE_REDIS_TOKEN"));
    const { emailPause } = await import("./email-pause");
    expect(await emailPause.isPaused(now)).toBe(true);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE_REDIS_TOKEN");
  });
  it("answers paused and logs once when client initialization throws", async () => {
    boundary.initialize.mockImplementation(() => { throw new Error("INVALID_CONFIG"); });
    const { emailPause } = await import("./email-pause");
    expect(await emailPause.isPaused(now)).toBe(true);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
