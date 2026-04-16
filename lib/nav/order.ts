/**
 * orderSidebarItems — pure function that reorders and annotates sidebar data
 * based on the user's effective role.
 *
 * From nav-spec section 3:
 * - Designer: lands on My requests, teams expanded, Active requests top
 * - PM: lands on Intake of primary team, Intake promoted
 * - Design Head (admin): lands on Home, teams collapsed, Commitments promoted
 * - Guest: personal zone only, "Shared with me", lands on most recent request
 */

import type { SidebarData, SidebarTeam } from "./types";
import type { WorkspaceRole } from "@/db/schema/workspace-members";
import type { TeamRole } from "@/db/schema/project_members";

export type EffectiveRole = "designer" | "pm" | "design_head" | "guest";

export interface OrderedTeam extends SidebarTeam {
  defaultOpen: boolean;
  /** The 5 fixed items in display order (first item is promoted) */
  itemOrder: readonly TeamItemKey[];
}

export type TeamItemKey =
  | "active_requests"
  | "intake_queue"
  | "commitments"
  | "prove"
  | "archive";

const DEFAULT_ORDER: readonly TeamItemKey[] = [
  "active_requests",
  "intake_queue",
  "commitments",
  "prove",
  "archive",
] as const;

const PM_ORDER: readonly TeamItemKey[] = [
  "intake_queue",
  "active_requests",
  "commitments",
  "prove",
  "archive",
] as const;

const DESIGN_HEAD_ORDER: readonly TeamItemKey[] = [
  "active_requests",
  "intake_queue",
  "commitments",
  "prove",
  "archive",
] as const;

export interface OrderedSidebar {
  landingPath: string;
  showCrossTeamViews: boolean;
  teams: OrderedTeam[];
}

/**
 * Derive the effective role from workspace role + team roles.
 * A workspace admin is always a design_head.
 * A workspace guest is always a guest.
 * Otherwise, use the first team role found (pm or designer).
 */
export function deriveEffectiveRole(
  workspaceRole: WorkspaceRole,
  teamRoles: (TeamRole | null)[],
): EffectiveRole {
  if (workspaceRole === "guest") return "guest";
  if (workspaceRole === "owner" || workspaceRole === "admin") return "design_head";
  if (teamRoles.some((r) => r === "pm")) return "pm";
  return "designer";
}

export function orderSidebarItems(
  data: SidebarData,
): OrderedSidebar {
  const teamRoles = data.teams.map((t) => t.teamRole);
  const role = deriveEffectiveRole(data.workspace.role, teamRoles);

  switch (role) {
    case "guest":
      return {
        landingPath: "/dashboard/inbox",
        showCrossTeamViews: false,
        teams: [],
      };

    case "pm":
      return {
        landingPath: data.teams.length > 0
          ? `/dashboard/teams/${data.teams[0].slug ?? data.teams[0].id}/intake`
          : "/dashboard/inbox",
        showCrossTeamViews: false,
        teams: data.teams.map((t, i) => ({
          ...t,
          defaultOpen: true,
          itemOrder: PM_ORDER,
        })),
      };

    case "design_head":
      return {
        landingPath: "/dashboard/report",
        showCrossTeamViews: true,
        teams: data.teams.map((t, i) => ({
          ...t,
          defaultOpen: i < 4 ? false : false, // all collapsed by default
          itemOrder: DESIGN_HEAD_ORDER,
        })),
      };

    case "designer":
    default:
      return {
        landingPath: "/dashboard/my-requests",
        showCrossTeamViews: false,
        teams: data.teams.map((t, i) => ({
          ...t,
          defaultOpen: i < 4,
          itemOrder: DEFAULT_ORDER,
        })),
      };
  }
}
