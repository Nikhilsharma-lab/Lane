import { describe, expect, it } from "vitest";
import { isLocalTestDatabase, testDatabaseFor } from "./test-database";

describe("the test database each copy resets", () => {
  it("is lane_test in the main checkout and lane_test_<copy> in a worktree", () => {
    expect(testDatabaseFor("/Users/me/Lane")).toBe("lane_test");
    expect(testDatabaseFor("/Users/me/Lane/.claude/worktrees/i1-intake-uploads")).toBe("lane_test_i1_intake_uploads");
    expect(testDatabaseFor("/Users/me/Lane/.claude/worktrees/Fix.Some--Thing/src")).toBe("lane_test_fix_some_thing");
  });
  it("is only ever a loopback lane_test database", () => {
    expect(isLocalTestDatabase("postgresql://me@localhost/lane_test")).toBe(true);
    expect(isLocalTestDatabase("postgresql://me@127.0.0.1:5432/lane_test_w3_list_view_model")).toBe(true);
    for (const url of ["postgresql://me@db.example.com/lane_test_copy", "postgresql://me@localhost/lane_testing", "postgresql://me@localhost/lane_test-copy", "postgresql://me@localhost/production", undefined])
      expect(isLocalTestDatabase(url)).toBe(false);
  });
});
