/**
 * Pure-function mirrors of the RLS policies on `requests` (streams).
 * The SQL in supabase/migrations/20260412_nav_schema.sql implements
 * exactly the same three OR'd conditions.  These functions exist so
 * Vitest can verify the logic without a live Supabase connection.
 */

import type { WorkspaceRole } from "@/db/schema/workspace-members";

export interface StreamRow {
  id: string;
  teamId: string;
  workspaceId: string;
}

export interface TeamMembershipRow {
  teamId: string;
  userId: string;
}

export interface WorkspaceMemberRow {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface StreamGuestRow {
  streamId: string;
  userId: string;
}

/** Policy 1 — members_see_team_streams */
export function memberCanSeeStream(
  userId: string,
  stream: StreamRow,
  teamMemberships: TeamMembershipRow[],
): boolean {
  return teamMemberships.some(
    (m) => m.userId === userId && m.teamId === stream.teamId,
  );
}

/** Policy 2 — admins_see_all */
export function adminCanSeeStream(
  userId: string,
  stream: StreamRow,
  workspaceMembers: WorkspaceMemberRow[],
): boolean {
  return workspaceMembers.some(
    (wm) =>
      wm.userId === userId &&
      wm.workspaceId === stream.workspaceId &&
      (wm.role === "owner" || wm.role === "admin"),
  );
}

/** Policy 3 — guests_see_invited_streams */
export function guestCanSeeStream(
  userId: string,
  stream: StreamRow,
  streamGuests: StreamGuestRow[],
): boolean {
  return streamGuests.some(
    (g) => g.userId === userId && g.streamId === stream.id,
  );
}

/**
 * Combined check — mirrors the three OR'd RLS policies.
 * Returns true if any policy grants access.
 */
export function canUserSeeStream(
  userId: string,
  stream: StreamRow,
  ctx: {
    teamMemberships: TeamMembershipRow[];
    workspaceMembers: WorkspaceMemberRow[];
    streamGuests: StreamGuestRow[];
  },
): boolean {
  return (
    memberCanSeeStream(userId, stream, ctx.teamMemberships) ||
    adminCanSeeStream(userId, stream, ctx.workspaceMembers) ||
    guestCanSeeStream(userId, stream, ctx.streamGuests)
  );
}

/**
 * Filter a list of streams to only those visible to a given user.
 * Equivalent to `SELECT * FROM requests` with RLS active.
 */
export function filterVisibleStreams(
  userId: string,
  streams: StreamRow[],
  ctx: {
    teamMemberships: TeamMembershipRow[];
    workspaceMembers: WorkspaceMemberRow[];
    streamGuests: StreamGuestRow[];
  },
): StreamRow[] {
  return streams.filter((s) => canUserSeeStream(userId, s, ctx));
}
