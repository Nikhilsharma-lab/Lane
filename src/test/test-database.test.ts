import { describe, expect, it } from "vitest";
import { testDatabaseFor } from "./test-database";

describe("the test database each copy resets", () => {
  it("does not collapse distinct Codex checkout identities", () => {
    const first = testDatabaseFor("/Users/me/.codex/worktrees/alpha/Lane");
    const second = testDatabaseFor("/Users/me/.codex/worktrees/beta/Lane");
    expect(first).not.toBe(second);
    expect(first).not.toBe("lane_test");
  });
  it("bounds readable names and distinguishes normalized or truncated names", () => {
    const roots = ["/copies/Fix.Thing", "/copies/Fix-Thing", `/copies/${"x".repeat(100)}a`, `/copies/${"x".repeat(100)}b`];
    const names = roots.map(testDatabaseFor);
    expect(new Set(names).size).toBe(4);
    for (const name of names) expect(name).toMatch(/^lane_test_[a-z0-9_]{1,32}_[a-f0-9]{20}$/);
    expect(names.every(name => name.length <= 63)).toBe(true);
    expect(testDatabaseFor(roots[0])).toBe(names[0]);
  });
});
