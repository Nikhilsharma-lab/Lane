import { describe, expect, it } from "vitest";

import { assertClerkDevelopmentInstance } from "./clerk-development-guard";

describe("assertClerkDevelopmentInstance", () => {
  it("allows Clerk development keys", () => {
    expect(() =>
      assertClerkDevelopmentInstance({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_lane",
        CLERK_SECRET_KEY: "sk_test_lane",
      })
    ).not.toThrow();
  });

  it("refuses live or missing Clerk keys before mutating users", () => {
    expect(() =>
      assertClerkDevelopmentInstance({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_lane",
        CLERK_SECRET_KEY: "sk_test_lane",
      })
    ).toThrow(/development instance/);

    expect(() =>
      assertClerkDevelopmentInstance({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_lane",
        CLERK_SECRET_KEY: "sk_live_lane",
      })
    ).toThrow(/development instance/);

    expect(() => assertClerkDevelopmentInstance({})).toThrow(
      /development instance/
    );
  });

  // E2E mutations now require stricter exact-instance and fixture-ownership
  // checks, behavior-tested in src/test/e2e-safety.test.ts.
});
