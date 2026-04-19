/**
 * Regression tests for selectRateLimiterConfig.
 *
 * Bug: rate-limit.ts silently returned null limiters when Upstash env vars
 * were missing. In production this removed all rate limiting from AI routes,
 * exposing the app to cost runaway on any misconfigured deploy.
 *
 * Fix: fail closed in production — throw at module init if the env vars
 * aren't set. Dev and test fall back with a warning (matches the pattern
 * established by selectUserSessionDatabaseUrl in db/user.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { selectRateLimiterConfig } from "@/lib/rate-limit";

describe("selectRateLimiterConfig", () => {
  it("returns enabled config when both env vars are set", () => {
    const result = selectRateLimiterConfig({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token-123",
      NODE_ENV: "production",
    });
    expect(result).toEqual({
      enabled: true,
      url: "https://example.upstash.io",
      token: "token-123",
    });
  });

  it("returns enabled config in development when both env vars are set", () => {
    const result = selectRateLimiterConfig({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token-123",
      NODE_ENV: "development",
    });
    expect(result.enabled).toBe(true);
  });

  it("throws in production when URL is missing", () => {
    expect(() =>
      selectRateLimiterConfig({
        UPSTASH_REDIS_REST_TOKEN: "token-123",
        NODE_ENV: "production",
      })
    ).toThrow(/required in production/);
  });

  it("throws in production when token is missing", () => {
    expect(() =>
      selectRateLimiterConfig({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        NODE_ENV: "production",
      })
    ).toThrow(/required in production/);
  });

  it("throws in production when both are missing", () => {
    expect(() =>
      selectRateLimiterConfig({ NODE_ENV: "production" })
    ).toThrow(/required in production/);
  });

  it("falls back with a warning in development when env vars missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = selectRateLimiterConfig({ NODE_ENV: "development" });
    expect(result).toEqual({ enabled: false });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Upstash not configured")
    );
    warn.mockRestore();
  });

  it("treats test env like development (warns, returns disabled)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = selectRateLimiterConfig({ NODE_ENV: "test" });
    expect(result).toEqual({ enabled: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("treats unset NODE_ENV as non-production (warns, returns disabled)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = selectRateLimiterConfig({});
    expect(result).toEqual({ enabled: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects partial config where only one var is set (dev: warn)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = selectRateLimiterConfig({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      NODE_ENV: "development",
    });
    expect(result).toEqual({ enabled: false });
    warn.mockRestore();
  });
});
