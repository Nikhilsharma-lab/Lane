import "server-only";

import { and, desc, eq, exists, gt, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Invitation, InvitationStatus, InvitationViewer } from "@/components/auth/better-auth/invitation-flow";
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

/** Better Auth's stored statuses as the invitation page names them. */
const STATUSES: Record<string, InvitationStatus> = { pending: "pending", accepted: "accepted", rejected: "declined", canceled: "cancelled" };

/**
 * #392: one invitation and who is looking at it, for anyone holding its link (#346): its workspace and inviter, and
 * the signed-in person's email, else whether the invited email has a Lane account, matched ignoring case. Null for an
 * unknown id, or a role or status Lane doesn't know. One query.
 */
export async function loadInvitation(id: string, viewerId: string | null): Promise<{ invitation: Invitation; viewer: InvitationViewer; workspaceId: string } | null> {
  const inviter = alias(profiles, "inviter");
  const viewer = alias(profiles, "viewer");
  const account = alias(profiles, "account");
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      expired: sql<boolean>`${lte(invitation.expiresAt, sql`now()`)}`,
      workspaceId: workspaces.id,
      workspace: workspaces.name,
      inviter: inviter.fullName,
      viewerEmail: viewer.email,
      hasAccount: sql<boolean>`${exists(db.select({ one: sql`1` }).from(account).where(sql`lower(${account.email}) = lower(${invitation.email})`))}`,
    })
    .from(invitation)
    .innerJoin(workspaces, eq(workspaces.id, invitation.organizationId))
    .innerJoin(inviter, eq(inviter.id, invitation.inviterId))
    .leftJoin(viewer, viewerId === null ? sql`false` : eq(viewer.id, viewerId))
    .where(eq(invitation.id, id))
    .limit(1);
  if (!row) return null;

  const { email, role, workspace, workspaceId } = row;
  const status = Object.hasOwn(STATUSES, row.status) ? STATUSES[row.status] : null;
  if (!status || !role || !isWorkspacePermission(role)) return null;
  return {
    invitation: { id, email, role, workspace, inviter: row.inviter, expiresAt: row.expiresAt.toISOString(), status: status === "pending" && row.expired ? "expired" : status },
    viewer: row.viewerEmail === null ? { signedIn: false, hasAccount: row.hasAccount } : { signedIn: true, email: row.viewerEmail },
    workspaceId,
  };
}
