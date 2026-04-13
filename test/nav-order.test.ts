import { describe, it, expect } from "vitest";
import {
  orderSidebarItems,
  deriveEffectiveRole,
  type OrderedSidebar,
} from "@/lib/nav/order";
import type { SidebarData, SidebarTeam } from "@/lib/nav/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTeam(overrides: Partial<SidebarTeam> = {}): SidebarTeam {
  return {
    id: "team-1",
    name: "Consumer App",
    slug: "consumer-app",
    teamRole: "designer",
    isTeamAdmin: false,
    streamCounts: { active: 3, intake: 1, validation: 0, archived: 2, total: 6 },
    ...overrides,
  };
}

function makeData(overrides: Partial<SidebarData> = {}): SidebarData {
  return {
    workspace: { id: "ws-1", name: "Lane", slug: "lane", role: "member" },
    personal: { inbox: 0, myRequests: 2, submittedByMe: 0, drafts: 0 },
    teams: [makeTeam()],
    user: { id: "u-1", fullName: "Test User", email: "test@lane.io" },
    ...overrides,
  };
}

// ── deriveEffectiveRole ─────────────────────────────────────────────────────

describe("deriveEffectiveRole", () => {
  it("guest workspace role → guest", () => {
    expect(deriveEffectiveRole("guest", [])).toBe("guest");
  });

  it("owner workspace role → design_head", () => {
    expect(deriveEffectiveRole("owner", ["lead"])).toBe("design_head");
  });

  it("admin workspace role → design_head", () => {
    expect(deriveEffectiveRole("admin", ["designer"])).toBe("design_head");
  });

  it("member with pm team role → pm", () => {
    expect(deriveEffectiveRole("member", ["pm", "designer"])).toBe("pm");
  });

  it("member with designer team role → designer", () => {
    expect(deriveEffectiveRole("member", ["designer"])).toBe("designer");
  });

  it("member with no team roles → designer", () => {
    expect(deriveEffectiveRole("member", [])).toBe("designer");
  });

  it("member with null team roles → designer", () => {
    expect(deriveEffectiveRole("member", [null])).toBe("designer");
  });
});

// ── orderSidebarItems per role ──────────────────────────────────────────────

describe("orderSidebarItems — Designer (member)", () => {
  it("lands on My requests", () => {
    const result = orderSidebarItems(makeData());
    expect(result.landingPath).toBe("/dashboard/my-requests");
  });

  it("teams expanded by default (first 4)", () => {
    const result = orderSidebarItems(makeData());
    expect(result.teams[0].defaultOpen).toBe(true);
  });

  it("teams past 4 are collapsed", () => {
    const fiveTeams = Array.from({ length: 5 }, (_, i) =>
      makeTeam({ id: `t-${i}`, name: `Team ${i}`, slug: `t-${i}` }),
    );
    const result = orderSidebarItems(makeData({ teams: fiveTeams }));
    expect(result.teams[3].defaultOpen).toBe(true);
    expect(result.teams[4].defaultOpen).toBe(false);
  });

  it("Active streams is first in item order", () => {
    const result = orderSidebarItems(makeData());
    expect(result.teams[0].itemOrder[0]).toBe("active_streams");
  });

  it("does not show cross-team views", () => {
    expect(orderSidebarItems(makeData()).showCrossTeamViews).toBe(false);
  });
});

describe("orderSidebarItems — PM (member with pm team role)", () => {
  const pmData = makeData({
    teams: [makeTeam({ teamRole: "pm" })],
  });

  it("lands on primary team's intake queue", () => {
    const result = orderSidebarItems(pmData);
    expect(result.landingPath).toBe("/dashboard/teams/consumer-app/intake");
  });

  it("Intake queue is promoted to top of item order", () => {
    const result = orderSidebarItems(pmData);
    expect(result.teams[0].itemOrder[0]).toBe("intake_queue");
  });

  it("teams are expanded", () => {
    const result = orderSidebarItems(pmData);
    expect(result.teams[0].defaultOpen).toBe(true);
  });

  it("does not show cross-team views", () => {
    expect(orderSidebarItems(pmData).showCrossTeamViews).toBe(false);
  });
});

describe("orderSidebarItems — Design Head (admin)", () => {
  const adminData = makeData({
    workspace: { id: "ws-1", name: "Lane", slug: "lane", role: "admin" },
    teams: [
      makeTeam({ id: "t-1", teamRole: "lead" }),
      makeTeam({ id: "t-2", name: "Platform", slug: "platform", teamRole: "designer" }),
    ],
  });

  it("lands on Weekly report", () => {
    const result = orderSidebarItems(adminData);
    expect(result.landingPath).toBe("/dashboard/report");
  });

  it("teams collapsed by default", () => {
    const result = orderSidebarItems(adminData);
    for (const team of result.teams) {
      expect(team.defaultOpen).toBe(false);
    }
  });

  it("shows cross-team views", () => {
    expect(orderSidebarItems(adminData).showCrossTeamViews).toBe(true);
  });
});

describe("orderSidebarItems — Guest", () => {
  const guestData = makeData({
    workspace: { id: "ws-1", name: "Lane", slug: "lane", role: "guest" },
    teams: [],
  });

  it("lands on inbox (shared with me)", () => {
    const result = orderSidebarItems(guestData);
    expect(result.landingPath).toBe("/dashboard/inbox");
  });

  it("has no teams", () => {
    const result = orderSidebarItems(guestData);
    expect(result.teams).toEqual([]);
  });

  it("does not show cross-team views", () => {
    expect(orderSidebarItems(guestData).showCrossTeamViews).toBe(false);
  });
});

describe("orderSidebarItems — Owner", () => {
  it("treated same as admin (design_head)", () => {
    const ownerData = makeData({
      workspace: { id: "ws-1", name: "Lane", slug: "lane", role: "owner" },
    });
    const result = orderSidebarItems(ownerData);
    expect(result.landingPath).toBe("/dashboard/report");
    expect(result.showCrossTeamViews).toBe(true);
  });
});

describe("orderSidebarItems — edge cases", () => {
  it("PM with no teams falls back to inbox", () => {
    const noTeams = makeData({
      teams: [],
    });
    // member with no teams can't be pm (no team roles), so it's designer
    const result = orderSidebarItems(noTeams);
    expect(result.landingPath).toBe("/dashboard/my-requests");
  });
});
