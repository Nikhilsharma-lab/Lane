/**
 * Nav query functions — server-side only.
 *
 * Uses GROUP BY for team stream counts (no N+1).
 * All queries use the system db; RLS is enforced at the Supabase level.
 */

import { eq, and, sql, count, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  workspaces,
  profiles,
  workspaceMembers,
  teams,
  teamMemberships,
  requests,
  streamGuests,
} from "@/db/schema";
import type { WorkspaceRole } from "@/db/schema/workspace-members";
import type { TeamRole } from "@/db/schema/project_members";

// ── Return types ────────────────────────────────────────��───────────────────

export interface WorkspaceRoleResult {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
}

export interface TeamForSidebar {
  id: string;
  name: string;
  slug: string | null;
  teamRole: TeamRole | null;
  isTeamAdmin: boolean;
  streamCounts: {
    active: number;
    intake: number;
    prove: number;
    archived: number;
    total: number;
  };
}

export interface PersonalZoneCounts {
  myRequests: number;
  submittedByMe: number;
  drafts: number;
  inbox: number;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Get the current user's workspace role.
 * Returns null if the user isn't a member of the workspace.
 */
export async function getCurrentUserWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRoleResult | null> {
  const rows = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0] as WorkspaceRoleResult;
}

/**
 * Get teams the user belongs to, with stream counts per team.
 * Uses a single GROUP BY query — no N+1.
 * Guests get an empty array (they have no team memberships).
 */
export async function getUserTeamsForSidebar(
  userId: string,
  workspaceId: string,
): Promise<TeamForSidebar[]> {
  // Step 1: Get user's team memberships
  const memberships = await db
    .select({
      teamId: teamMemberships.teamId,
      teamName: teams.name,
      teamSlug: teams.slug,
      teamRole: teamMemberships.teamRole,
      isTeamAdmin: teamMemberships.isTeamAdmin,
    })
    .from(teamMemberships)
    .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
    .where(
      and(
        eq(teamMemberships.userId, userId),
        eq(teams.orgId, workspaceId),
      ),
    );

  if (memberships.length === 0) return [];

  const teamIds = memberships.map((m) => m.teamId);

  // Step 2: Count streams per team, grouped by phase, in one query
  const streamCountRows = await db
    .select({
      teamId: requests.projectId,
      phase: requests.phase,
      cnt: count(),
    })
    .from(requests)
    .where(inArray(requests.projectId, teamIds))
    .groupBy(requests.projectId, requests.phase);

  // Build count map: teamId → { active, intake, prove, archived, total }
  const countMap = new Map<string, TeamForSidebar["streamCounts"]>();
  for (const row of streamCountRows) {
    if (!row.teamId) continue;
    let entry = countMap.get(row.teamId);
    if (!entry) {
      entry = { active: 0, intake: 0, prove: 0, archived: 0, total: 0 };
      countMap.set(row.teamId, entry);
    }
    const n = Number(row.cnt);
    entry.total += n;
    switch (row.phase) {
      case "design":
      case "dev":
        entry.active += n;
        break;
      case "predesign":
        entry.intake += n;
        break;
      case "track":
        entry.archived += n;
        break;
    }
  }

  // Step 3: Count requests in Prove (design_stage = 'prove')
  const proveRows = await db
    .select({
      teamId: requests.projectId,
      cnt: count(),
    })
    .from(requests)
    .where(
      and(
        inArray(requests.projectId, teamIds),
        eq(requests.designStage, "prove"),
      ),
    )
    .groupBy(requests.projectId);

  for (const row of proveRows) {
    if (!row.teamId) continue;
    const entry = countMap.get(row.teamId);
    if (entry) {
      entry.prove = Number(row.cnt);
    }
  }

  return memberships.map((m) => ({
    id: m.teamId,
    name: m.teamName,
    slug: m.teamSlug,
    teamRole: m.teamRole,
    isTeamAdmin: m.isTeamAdmin ?? false,
    streamCounts: countMap.get(m.teamId) ?? {
      active: 0,
      intake: 0,
      prove: 0,
      archived: 0,
      total: 0,
    },
  }));
}

/**
 * Get counts for the Personal zone.
 * - myRequests: requests where user is the designer_owner
 * - submittedByMe: requests where user is the requester (needs requester_id column)
 * - drafts: requests in draft status owned by user
 * - inbox: placeholder (0) — inbox count comes from notifications table
 */
export async function getPersonalZoneCounts(
  userId: string,
  workspaceId: string,
): Promise<PersonalZoneCounts> {
  const [myRequestsRow] = await db
    .select({ cnt: count() })
    .from(requests)
    .where(
      and(
        eq(requests.designerOwnerId, userId),
        eq(requests.orgId, workspaceId),
      ),
    );

  const [draftsRow] = await db
    .select({ cnt: count() })
    .from(requests)
    .where(
      and(
        eq(requests.requesterId, userId),
        eq(requests.orgId, workspaceId),
        eq(requests.status, "draft"),
      ),
    );

  return {
    myRequests: Number(myRequestsRow?.cnt ?? 0),
    // TODO: real count needs a dedicated requester_id column on the requests table
    submittedByMe: 0,
    drafts: Number(draftsRow?.cnt ?? 0),
    inbox: 0, // Driven by notifications table, not queried here
  };
}
