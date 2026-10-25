"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { refusal, requireOwnerOrAdmin } from "@/lib/auth-guard";
import { customRoles } from "@/lib/feature-switches";
import {
  clerkRoleOf, inviteInputSchema, revokeInvitationInputSchema, roleChangeInputSchema, rolesOffered,
} from "@/lib/member-role-rules";
import type { WorkspacePermission } from "@/lib/auth-guard";

/**
 * Settings → Members (#210): an Admin invites people as, and changes people to, Admin, Member, Guest or Viewer.
 * Clerk stays the only owner of memberships and invitations: these actions ask Clerk's Backend API and store
 * nothing. The workspace comes from the page; the Admin, and their role, only from the session. Guest and Viewer
 * are Clerk custom roles that production can't have until Clerk Enhanced B2B is approved, so they are refused
 * while the `LANE_CUSTOM_ROLES` switch is off.
 */

type Result = { success: true } | { error: string };

const ROLES_UNAVAILABLE = "Guest and Viewer aren't available in this workspace yet. Invite them as a Member, or ask whoever runs Lane to turn these roles on.";
const CHANGE_UNAVAILABLE = "Guest and Viewer aren't available in this workspace yet. Choose Admin or Member.";

const offered = (role: WorkspacePermission) => rolesOffered(customRoles()).includes(role);
const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? "Check the form.";

/** Clerk's error code, when Clerk refused the request. */
function clerkCode(error: unknown): string | null {
  const errors = (error as { errors?: { code?: string }[] })?.errors;
  return Array.isArray(errors) ? errors[0]?.code ?? null : null;
}

export async function inviteToWorkspace(data: { email: string; role: string }, context: { orgId: string }): Promise<Result> {
  const parsed = inviteInputSchema.safeParse(data);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) return { error: await refusal("Only Admins can invite people to this workspace.") };
  const { email, role } = parsed.data;
  if (!offered(role)) return { error: ROLES_UNAVAILABLE };

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: auth.orgId, emailAddress: email, role: clerkRoleOf(role), inviterUserId: auth.userId,
    });
  } catch (error) {
    const code = clerkCode(error);
    if (code === "duplicate_record" || code === "already_a_member_in_organization")
      return { error: `${email} already has an invitation or is already in this workspace.` };
    console.error("[members] invitation failed", { code });
    return { error: "The invitation couldn't be sent. Try again." };
  }
  revalidatePath("/settings/members");
  return { success: true };
}

export async function changeMemberRole(data: { userId: string; role: string }, context: { orgId: string }): Promise<Result> {
  const parsed = roleChangeInputSchema.safeParse(data);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) return { error: await refusal("Only Admins can change people's roles.") };
  const { userId, role } = parsed.data;
  // An Admin can't demote themselves, so a workspace always keeps the Admin who could undo a change.
  if (userId === auth.userId) return { error: "You can't change your own role. Ask another Admin to do it." };
  if (!offered(role)) return { error: CHANGE_UNAVAILABLE };

  try {
    const client = await clerkClient();
    const { data: memberships } = await client.organizations.getOrganizationMembershipList({ organizationId: auth.orgId, userId: [userId] });
    if (!memberships.some((m) => m.organization.id === auth.orgId && m.publicUserData?.userId === userId))
      return { error: "That person isn't in this workspace any more. Reload to see who is." };
    await client.organizations.updateOrganizationMembership({ organizationId: auth.orgId, userId, role: clerkRoleOf(role) });
  } catch (error) {
    console.error("[members] role change failed", { code: clerkCode(error) });
    return { error: "The role couldn't be changed. Try again." };
  }
  revalidatePath("/settings/members");
  return { success: true };
}

export async function revokeInvitation(data: { invitationId: string }, context: { orgId: string }): Promise<Result> {
  const parsed = revokeInvitationInputSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose an invitation to revoke." };
  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) return { error: await refusal("Only Admins can revoke invitations.") };
  const { invitationId } = parsed.data;
  const gone = { error: "That invitation isn't pending any more. Reload to see the latest." };

  try {
    const client = await clerkClient();
    const invitation = await client.organizations.getOrganizationInvitation({ organizationId: auth.orgId, invitationId }).catch(() => null);
    if (!invitation || invitation.organizationId !== auth.orgId || invitation.status !== "pending") return gone;
    await client.organizations.revokeOrganizationInvitation({ organizationId: auth.orgId, invitationId, requestingUserId: auth.userId });
  } catch (error) {
    console.error("[members] revoke failed", { code: clerkCode(error) });
    return { error: "The invitation couldn't be revoked. Try again." };
  }
  revalidatePath("/settings/members");
  return { success: true };
}
