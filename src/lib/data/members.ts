import "server-only";

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { db, invitation, member, profiles } from "@/db";
import type { WorkspacePermission, WorkspaceScope } from "@/lib/auth-guard";
import type { PendingInvitation, WorkspaceMember } from "@/lib/member-role-rules";
import { laneRole, managesWorkspace } from "@/lib/role-rules";

export type MemberLists = { people: WorkspaceMember[]; invitations: PendingInvitation[] };

async function loadPeople({ orgId }: WorkspaceScope): Promise<WorkspaceMember[]> {
  const rows = await db
    .select({ userId: member.userId, role: member.role, name: profiles.fullName, email: profiles.email })
    .from(member)
    .innerJoin(profiles, eq(profiles.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(desc(member.createdAt), member.id);
  return rows.map(({ userId, role, name, email }) => ({ userId, name: name || email || userId, email, role: laneRole(role) }));
}

/** An expired invitation isn't waiting any more: its link no longer works, and the address can be invited again. */
async function loadWorkspaceInvitations({ orgId }: WorkspaceScope): Promise<PendingInvitation[]> {
  const rows = await db
    .select({ id: invitation.id, email: invitation.email, role: invitation.role })
    .from(invitation)
    .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending"), gt(invitation.expiresAt, sql`now()`)))
    .orderBy(desc(invitation.createdAt), invitation.id);
  return rows.map(({ role, ...row }) => ({ ...row, role: laneRole(role) }));
}

/**
 * #396: what Settings → Members lists for someone with `viewerRole`: everyone in the workspace, newest first, and the
 * pending invitations, which only an Admin is given. The caller has checked that they may see Members.
 */
export async function loadMembers(workspace: WorkspaceScope, viewerRole: WorkspacePermission): Promise<MemberLists> {
  const [people, invitations] = await Promise.all([loadPeople(workspace), managesWorkspace(viewerRole) ? loadWorkspaceInvitations(workspace) : []]);
  return { people, invitations };
}
