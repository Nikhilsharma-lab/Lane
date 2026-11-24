import "server-only";

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { PendingWorkspaceInvitation } from "@/components/auth/better-auth/onboarding-flow";
import { db, invitation, profiles, workspaces } from "@/db";
import { isWorkspacePermission } from "@/lib/role-rules";

/**
 * #391: the person's email and the invitations waiting for it, newest first, in one query. Only a verified email has
 * any (#333 Q12), matched ignoring case; only pending, unexpired ones with one of Lane's roles count.
 */
export async function loadPendingInvitations(userId: string): Promise<{ email: string; invitations: PendingWorkspaceInvitation[] }> {
  const inviter = alias(profiles, "inviter");
  const rows = await db
    .select({ email: profiles.email, id: invitation.id, role: invitation.role, workspace: workspaces.name, inviter: inviter.fullName })
    .from(profiles)
    .leftJoin(invitation, and(
      eq(profiles.emailVerified, true),
      sql`lower(${invitation.email}) = lower(${profiles.email})`,
      eq(invitation.status, "pending"),
      gt(invitation.expiresAt, sql`now()`),
    ))
    .leftJoin(workspaces, eq(workspaces.id, invitation.organizationId))
    .leftJoin(inviter, eq(inviter.id, invitation.inviterId))
    .where(eq(profiles.id, userId))
    .orderBy(desc(invitation.createdAt), desc(invitation.id));
  return {
    email: rows[0]?.email ?? "",
    invitations: rows.flatMap(({ id, role, workspace, inviter: name }) =>
      id !== null && workspace !== null && name !== null && role && isWorkspacePermission(role) ? [{ id, role, workspace, inviter: name }] : []),
  };
}
