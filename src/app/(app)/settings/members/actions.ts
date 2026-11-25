"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, invitation, member } from "@/db";
import type { AuthAnswer } from "@/lib/auth-answer";
import { AUTH_ERROR_COPY, isAuthErrorCode, type AuthErrorCode } from "@/lib/auth-error-copy";
import { activeMemberOrCode, guardOwnerOrAdmin } from "@/lib/auth-guard";
import { askAuthServer } from "@/lib/auth-server";
import { followSeatChanges } from "@/lib/billing";
import { billingEnforced } from "@/lib/feature-switches";
import {
  addsPaidSeat, CONFIRM_PAID_SEAT, inviteInputSchema, removeMemberInputSchema, revokeInvitationInputSchema, roleChangeInputSchema,
} from "@/lib/member-role-rules";
import { withinInvitationAllowance } from "@/lib/invitation-allowance";
import { inMembershipTurn } from "@/lib/membership-turn";
import { laneRole, managesWorkspace } from "@/lib/role-rules";
import type { WorkspacePermission } from "@/lib/auth-guard";

/**
 * Settings → Members (#210): an Admin invites people as, and changes people to, Admin, Member, Guest or Viewer, in
 * every workspace (#393), cancels invitations and removes people (#396). Better Auth owns memberships and
 * invitations: these actions ask it through Lane's server door, and write only a pending invitation's cancelling. The
 * workspace comes from the page; the Admin, and their role, only from the session.
 *
 * #215: Admins and Members are paid seats. While billing is enforced, adding one needs the Admin's "This adds a paid
 * seat" confirmation (`confirmedPaidSeat`), and a paying workspace's billed seats follow each role change and removal.
 *
 * Every change revalidates, so its own answer carries the lists read again, on whichever Settings page it was made.
 */

type Result = { success: true } | { error: string; sessionExpired?: true };
/** An invitation's refusal; `field` says it is about the address, so Invite people shows it on the email field. */
type InviteResult = Result | { error: string; field: "email" };

/** Better Auth's membership limit (auth-server.ts), which it applies only as someone accepts. */
const MEMBERSHIP_LIMIT = 100;
/** Better Auth keeps an invitation whose email failed, and refuses another to the same address. Proposed for Nikhil (#396): the second sentence. */
const INVITATION_UNSENT = "The invitation couldn’t be sent. Revoke it on the Members page in Settings, then invite them again.";

/** A paid seat added while billing is enforced needs the Admin's confirmation. */
const unconfirmedSeat = (from: WorkspacePermission | null, to: WorkspacePermission, confirmed?: boolean) => billingEnforced() && addsPaidSeat(from, to) && !confirmed;
const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? "Check the form.";
const changed = () => revalidatePath("/settings/members");

/** What Better Auth refused, in Lane's words; `otherwise` for a refusal Lane has none for. */
function refusal(code: string | undefined, otherwise: string): { error: string } {
  if (isAuthErrorCode(code)) return { error: AUTH_ERROR_COPY[code] };
  console.error("[members] refused", { code });
  return { error: otherwise };
}

async function memberRow(orgId: string, userId: string) {
  const [row] = await db.select({ id: member.id, role: member.role }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  return row;
}

export async function inviteToWorkspace(data: { email: string; role: string; confirmedPaidSeat?: boolean }, context: { orgId: string }): Promise<InviteResult> {
  const parsed = inviteInputSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === "email" ? { error: issue.message, field: "email" } : { error: firstIssue(parsed.error) };
  }
  const auth = await guardOwnerOrAdmin(context.orgId, "Only Admins can invite people to this workspace.");
  if ("error" in auth) return auth;
  const { email, role, confirmedPaidSeat } = parsed.data;
  if (unconfirmedSeat(null, role, confirmedPaidSeat)) return { error: CONFIRM_PAID_SEAT };
  if (await db.$count(member, eq(member.organizationId, auth.orgId)) >= MEMBERSHIP_LIMIT) return { error: AUTH_ERROR_COPY.WORKSPACE_FULL };

  const invited = await withinInvitationAllowance(auth.userId, () =>
    askAuthServer((api, asCaller) => api.createInvitation({ ...asCaller, body: { organizationId: auth.orgId, email, role } })));
  if ("error" in invited) return invited;
  if (!invited.ok) {
    if (invited.code === "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION" || invited.code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION")
      return { error: `${email} already has an invitation or is already in this workspace.`, field: "email" };
    if (invited.code !== "INVITATION_NOT_SENT") return refusal(invited.code, "The invitation couldn’t be sent. Try again.");
    changed();
    return { error: INVITATION_UNSENT };
  }
  changed();
  return { success: true };
}

export async function changeMemberRole(data: { userId: string; role: string; confirmedPaidSeat?: boolean }, context: { orgId: string }): Promise<Result> {
  const parsed = roleChangeInputSchema.safeParse(data);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const auth = await guardOwnerOrAdmin(context.orgId, "Only Admins can change people’s roles.");
  if ("error" in auth) return auth;
  const { userId, role, confirmedPaidSeat } = parsed.data;
  // An Admin can't demote themselves, so a workspace always keeps the Admin who could undo a change.
  if (userId === auth.userId) return { error: "You can’t change your own role. Ask another Admin to do it." };

  const refused = await inMembershipTurn(auth.orgId, async () => {
    const target = await memberRow(auth.orgId, userId);
    if (!target) return { error: "That person isn’t in this workspace any more. Reload to see who is." };
    if (unconfirmedSeat(laneRole(target.role), role, confirmedPaidSeat)) return { error: CONFIRM_PAID_SEAT };
    const answer = await askAuthServer((api, asCaller) => api.updateMemberRole({ ...asCaller, body: { organizationId: auth.orgId, memberId: target.id, role } }));
    return answer.ok ? null : refusal(answer.code, "The role couldn’t be changed. Try again.");
  });
  if (refused) return refused;
  // The role is changed either way; a seat change the provider missed is made by the next check.
  await followSeatChanges(auth);
  changed();
  return { success: true };
}

export async function revokeInvitation(data: { invitationId: string }, context: { orgId: string }): Promise<Result> {
  const parsed = revokeInvitationInputSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose an invitation to revoke." };
  const auth = await guardOwnerOrAdmin(context.orgId, "Only Admins can revoke invitations.");
  if ("error" in auth) return auth;
  const { invitationId } = parsed.data;

  // Better Auth cancels whatever the invitation's status, even one accepted a moment before, and in any workspace the
  // person is an Admin of. Its own accept takes only a pending one, so this and that can't both happen.
  const [canceled] = await db.update(invitation).set({ status: "canceled" })
    .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, auth.orgId), eq(invitation.status, "pending")))
    .returning({ id: invitation.id });
  if (!canceled) return { error: "That invitation isn’t pending any more. Reload to see the latest." };
  changed();
  return { success: true };
}

/** #396: takes someone else out of the workspace. Their Requests, comments and profile stay. */
export async function removeMember(data: { userId: string }, context: { orgId: string }): Promise<AuthAnswer> {
  const refused = (code: AuthErrorCode) => ({ ok: false, code }) as const;
  const auth = await activeMemberOrCode(context.orgId);
  if ("ok" in auth) return auth;
  if (!managesWorkspace(auth.role)) return refused("YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER");
  const parsed = removeMemberInputSchema.safeParse(data);
  if (!parsed.success) return refused("MEMBER_NOT_FOUND");
  const { userId } = parsed.data;
  if (userId === auth.userId) return refused("CANNOT_REMOVE_YOURSELF");

  const answer = await inMembershipTurn<AuthAnswer>(auth.orgId, async () => {
    const target = await memberRow(auth.orgId, userId);
    if (!target) return refused("MEMBER_NOT_FOUND");
    return askAuthServer((api, asCaller) => api.removeMember({ ...asCaller, body: { organizationId: auth.orgId, memberIdOrEmail: target.id } }));
  });
  if (!answer.ok) return answer;
  await followSeatChanges(auth);
  changed();
  return { ok: true };
}
