/**
 * Permission-matrix tests for canAdvanceRequestPhase.
 *
 * Lane's primary phase-advancement authorization lives in lib/request-permissions.ts.
 * Previously a second route (app/api/requests/[id]/advance — deleted in this PR)
 * applied a looser "requester || pm || lead || admin" check that bypassed the
 * phase-aware logic here, letting designers/developers be excluded from advancing
 * their own work and letting non-privileged callers skip gates. This test matrix
 * locks in the remaining layer so future refactors can't regress the permissions.
 */

import { describe, it, expect } from "vitest";
import { canAdvanceRequestPhase } from "@/lib/request-permissions";

const REQUESTER = "user-requester";
const DESIGNER = "user-designer";
const DEVELOPER = "user-developer";
const LEAD = "user-lead";
const ADMIN = "user-admin";
const PM = "user-pm";
const OTHER_DESIGNER = "user-other-designer";
const OTHER_DEVELOPER = "user-other-developer";

/** Context factory — one request, vary the viewer. */
function ctx(overrides: Partial<Parameters<typeof canAdvanceRequestPhase>[1]>) {
  return {
    userId: "user-unknown",
    profileRole: null,
    requesterId: REQUESTER,
    designerOwnerId: DESIGNER,
    devOwnerId: DEVELOPER,
    assignments: [
      { assigneeId: DESIGNER, profileRole: "designer" as const },
      { assigneeId: DEVELOPER, profileRole: "developer" as const },
    ],
    ...overrides,
  };
}

describe("canAdvanceRequestPhase — predesign", () => {
  it("allows the requester", () => {
    expect(
      canAdvanceRequestPhase("predesign", ctx({ userId: REQUESTER, profileRole: "designer" }))
    ).toBe(true);
  });

  it("allows a PM", () => {
    expect(canAdvanceRequestPhase("predesign", ctx({ userId: PM, profileRole: "pm" }))).toBe(true);
  });

  it("allows a lead", () => {
    expect(canAdvanceRequestPhase("predesign", ctx({ userId: LEAD, profileRole: "lead" }))).toBe(true);
  });

  it("allows an admin", () => {
    expect(canAdvanceRequestPhase("predesign", ctx({ userId: ADMIN, profileRole: "admin" }))).toBe(true);
  });

  it("denies an unrelated designer", () => {
    expect(
      canAdvanceRequestPhase("predesign", ctx({ userId: OTHER_DESIGNER, profileRole: "designer" }))
    ).toBe(false);
  });

  it("denies an unrelated developer", () => {
    expect(
      canAdvanceRequestPhase("predesign", ctx({ userId: OTHER_DEVELOPER, profileRole: "developer" }))
    ).toBe(false);
  });

  it("denies a user with null role who is not the requester", () => {
    expect(
      canAdvanceRequestPhase("predesign", ctx({ userId: "user-random", profileRole: null }))
    ).toBe(false);
  });
});

describe("canAdvanceRequestPhase — design", () => {
  it("allows the assigned designer (via designerOwnerId)", () => {
    expect(
      canAdvanceRequestPhase("design", ctx({ userId: DESIGNER, profileRole: "designer" }))
    ).toBe(true);
  });

  it("allows a designer assigned via assignments (no designerOwnerId match)", () => {
    const assignedViaAssignments = "user-assigned-only";
    expect(
      canAdvanceRequestPhase(
        "design",
        ctx({
          userId: assignedViaAssignments,
          profileRole: "designer",
          designerOwnerId: null,
          assignments: [{ assigneeId: assignedViaAssignments, profileRole: "designer" }],
        })
      )
    ).toBe(true);
  });

  it("allows a lead", () => {
    expect(canAdvanceRequestPhase("design", ctx({ userId: LEAD, profileRole: "lead" }))).toBe(true);
  });

  it("allows an admin", () => {
    expect(canAdvanceRequestPhase("design", ctx({ userId: ADMIN, profileRole: "admin" }))).toBe(true);
  });

  it("denies the requester (not privileged, not the assigned designer)", () => {
    expect(
      canAdvanceRequestPhase("design", ctx({ userId: REQUESTER, profileRole: null }))
    ).toBe(false);
  });

  it("denies a PM (not privileged, not designer)", () => {
    expect(canAdvanceRequestPhase("design", ctx({ userId: PM, profileRole: "pm" }))).toBe(false);
  });

  it("denies an unrelated designer", () => {
    expect(
      canAdvanceRequestPhase("design", ctx({ userId: OTHER_DESIGNER, profileRole: "designer" }))
    ).toBe(false);
  });

  it("denies the assigned developer (wrong phase owner)", () => {
    expect(
      canAdvanceRequestPhase("design", ctx({ userId: DEVELOPER, profileRole: "developer" }))
    ).toBe(false);
  });
});

describe("canAdvanceRequestPhase — dev", () => {
  it("allows the assigned developer (via devOwnerId)", () => {
    expect(
      canAdvanceRequestPhase("dev", ctx({ userId: DEVELOPER, profileRole: "developer" }))
    ).toBe(true);
  });

  it("allows a developer assigned via assignments (no devOwnerId match)", () => {
    const assignedViaAssignments = "user-assigned-only";
    expect(
      canAdvanceRequestPhase(
        "dev",
        ctx({
          userId: assignedViaAssignments,
          profileRole: "developer",
          devOwnerId: null,
          assignments: [{ assigneeId: assignedViaAssignments, profileRole: "developer" }],
        })
      )
    ).toBe(true);
  });

  it("allows a lead", () => {
    expect(canAdvanceRequestPhase("dev", ctx({ userId: LEAD, profileRole: "lead" }))).toBe(true);
  });

  it("allows an admin", () => {
    expect(canAdvanceRequestPhase("dev", ctx({ userId: ADMIN, profileRole: "admin" }))).toBe(true);
  });

  it("denies the requester", () => {
    expect(canAdvanceRequestPhase("dev", ctx({ userId: REQUESTER, profileRole: null }))).toBe(false);
  });

  it("denies a PM", () => {
    expect(canAdvanceRequestPhase("dev", ctx({ userId: PM, profileRole: "pm" }))).toBe(false);
  });

  it("denies the assigned designer (wrong phase owner)", () => {
    expect(
      canAdvanceRequestPhase("dev", ctx({ userId: DESIGNER, profileRole: "designer" }))
    ).toBe(false);
  });

  it("denies an unrelated developer", () => {
    expect(
      canAdvanceRequestPhase("dev", ctx({ userId: OTHER_DEVELOPER, profileRole: "developer" }))
    ).toBe(false);
  });
});

describe("canAdvanceRequestPhase — track", () => {
  it("allows the requester", () => {
    expect(
      canAdvanceRequestPhase("track", ctx({ userId: REQUESTER, profileRole: "designer" }))
    ).toBe(true);
  });

  it("allows a PM", () => {
    expect(canAdvanceRequestPhase("track", ctx({ userId: PM, profileRole: "pm" }))).toBe(true);
  });

  it("allows a lead", () => {
    expect(canAdvanceRequestPhase("track", ctx({ userId: LEAD, profileRole: "lead" }))).toBe(true);
  });

  it("allows an admin", () => {
    expect(canAdvanceRequestPhase("track", ctx({ userId: ADMIN, profileRole: "admin" }))).toBe(true);
  });

  it("denies an unrelated designer", () => {
    expect(
      canAdvanceRequestPhase("track", ctx({ userId: OTHER_DESIGNER, profileRole: "designer" }))
    ).toBe(false);
  });

  it("denies an unrelated developer", () => {
    expect(
      canAdvanceRequestPhase("track", ctx({ userId: OTHER_DEVELOPER, profileRole: "developer" }))
    ).toBe(false);
  });
});

describe("canAdvanceRequestPhase — defensive", () => {
  it("denies an unknown phase", () => {
    // Cast because the helper's signature enforces valid phases — exercising
    // the default branch defensively in case a runtime value ever slips through.
    expect(
      canAdvanceRequestPhase(
        "unknown-phase" as Parameters<typeof canAdvanceRequestPhase>[0],
        ctx({ userId: ADMIN, profileRole: "admin" })
      )
    ).toBe(false);
  });
});
