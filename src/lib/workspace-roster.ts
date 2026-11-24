import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, member, profiles } from "@/db";
import type { WorkspacePermission } from "./auth-guard";
import type { ReviewerIdentity } from "./request-reviewer-rules";
import { laneRole, PAID_ROLES } from "./role-rules";

/** Someone on a paid seat, as the roster lists them: an Admin or a Member of the workspace. */
export type RosterPerson = { nominee: ReviewerIdentity; name: string; email: string; role: WorkspacePermission };

/**
 * The workspace's Admins and Members: the paid seats, and the only people who can be Reviewers (#211). Guests,
 * Viewers and any role Lane doesn't know are left out. One query on Better Auth's member rows, read fresh each
 * time and needing no session (#390). Newest first.
 */
export async function workspaceRoster(orgId: string): Promise<RosterPerson[]> {
  const rows = await db
    .select({ userId: member.userId, role: member.role, name: profiles.fullName, email: profiles.email })
    .from(member)
    .innerJoin(profiles, eq(profiles.id, member.userId))
    .where(and(eq(member.organizationId, orgId), inArray(member.role, PAID_ROLES)))
    .orderBy(desc(member.createdAt), member.id);
  return rows.flatMap(({ userId, role: stored, name, email }) => {
    const role = laneRole(stored);
    return role ? [{ nominee: { kind: "member" as const, userId }, role, name: name || email || userId, email: email.toLowerCase() }] : [];
  });
}

/** Whether the person is the workspace's only Admin, who can't leave it (#333 Q4, #395). Better Auth's refusal decides. */
export async function isOnlyAdmin(orgId: string, userId: string): Promise<boolean> {
  const admins = await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, orgId), eq(member.role, "admin"))).limit(2);
  return admins.length === 1 && admins[0].userId === userId;
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
  const role = laneRole(row?.role);
  return role && { role, email: row.email.toLowerCase() };
}
