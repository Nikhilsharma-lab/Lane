import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, member, profiles } from "@/db";
import type { WorkspacePermission } from "./auth-guard";
import type { ReviewerIdentity } from "./request-reviewer-rules";
import { canChangeThings, isWorkspacePermission, WORKSPACE_ROLES } from "./role-rules";

/** Someone on a paid seat: an Admin or a Member of the workspace. */
export type WorkspacePerson = { nominee: ReviewerIdentity; name: string; email: string; role: WorkspacePermission };

const PAID_ROLES = WORKSPACE_ROLES.filter(canChangeThings);

/**
 * The workspace's Admins and Members: the paid seats, and the only people who can be Reviewers (#211). Guests,
 * Viewers and any role Lane doesn't know are left out. One query on Better Auth's member rows, read fresh each
 * time and needing no session (#390). Newest first.
 */
export async function workspaceRoster(orgId: string): Promise<WorkspacePerson[]> {
  const rows = await db
    .select({ userId: member.userId, role: member.role, name: profiles.fullName, email: profiles.email })
    .from(member)
    .innerJoin(profiles, eq(profiles.id, member.userId))
    .where(and(eq(member.organizationId, orgId), inArray(member.role, PAID_ROLES)))
    .orderBy(desc(member.createdAt), member.id);
  return rows.flatMap(({ userId, role, name, email }) =>
    isWorkspacePermission(role) ? [{ nominee: { kind: "member" as const, userId }, role, name: name || email || userId, email: email.toLowerCase() }] : []);
}

/**
 * One person's live membership of the workspace, any of Lane's roles (#212). Null once they have left, or while they
 * hold a role Lane doesn't know.
 */
export async function workspaceMember(orgId: string, userId: string): Promise<{ role: WorkspacePermission; email: string } | null> {
  const [row] = await db
    .select({ role: member.role, email: profiles.email })
    .from(member)
    .innerJoin(profiles, eq(profiles.id, member.userId))
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  return row && isWorkspacePermission(row.role) ? { role: row.role, email: row.email.toLowerCase() } : null;
}
