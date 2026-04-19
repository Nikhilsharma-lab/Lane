/**
 * Regression test for published-view authenticated access.
 *
 * Bug: `app/views/[id]/page.tsx` only checked that a user was logged in for
 * `authenticated` access mode, then queried requests by the view's `orgId`.
 * Any authenticated user with a view ID from another org could read that
 * org's request data.
 *
 * Fix: `canAccessAuthenticatedView` requires the viewer's profile to belong
 * to the same org as the view.
 */

import { describe, it, expect } from "vitest";
import { canAccessAuthenticatedView } from "@/lib/views/access";

const ORG_A = "org-a";
const ORG_B = "org-b";

describe("canAccessAuthenticatedView", () => {
  it("allows a user whose profile org matches the view org", () => {
    expect(canAccessAuthenticatedView(ORG_A, ORG_A)).toBe(true);
  });

  it("rejects a user from a different org (the original leak)", () => {
    expect(canAccessAuthenticatedView(ORG_A, ORG_B)).toBe(false);
  });

  it("rejects a user with no profile loaded (null)", () => {
    expect(canAccessAuthenticatedView(ORG_A, null)).toBe(false);
  });

  it("rejects a user with no profile loaded (undefined)", () => {
    expect(canAccessAuthenticatedView(ORG_A, undefined)).toBe(false);
  });

  it("rejects empty-string org id even if it would string-match", () => {
    // Defensive: empty view org should never grant access, even against
    // an empty profile org. Both being empty is a bug signal, not a pass.
    expect(canAccessAuthenticatedView("", "")).toBe(false);
  });
});
