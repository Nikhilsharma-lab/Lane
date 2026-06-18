"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db, invites, workspaceMembers, profiles } from "@/db";
import { eq, and } from "drizzle-orm";
import { requireOwnerOrAdmin } from "@/lib/auth-guard";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROLE_LEVEL: Record<string, number> = { owner: 30, admin: 20, member: 10 };

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["member", "admin"]).default("member"),
});

function inviteUrl(token: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL || ""}/invite/${token}`;
}

export async function createInvite(
  formData: { email: string; role?: string },
  context: { orgId: string }
) {
  const parsed = inviteSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) {
    return { error: "Only owners and admins can invite members." };
  }

  const email = parsed.data.email.toLowerCase();

  const [existingMember] = await db
    .select({ userId: profiles.id })
    .from(profiles)
    .innerJoin(
      workspaceMembers,
      and(
        eq(profiles.id, workspaceMembers.userId),
        eq(workspaceMembers.workspaceId, auth.orgId),
        eq(workspaceMembers.isActive, true)
      )
    )
    .where(eq(profiles.email, email));

  if (existingMember) {
    return { error: "This person is already a member." };
  }

  const [existing] = await db
    .select({ id: invites.id, token: invites.token })
    .from(invites)
    .where(
      and(
        eq(invites.orgId, auth.orgId),
        eq(invites.email, email),
        eq(invites.status, "pending")
      )
    );

  if (existing) {
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
      .where(eq(invites.id, existing.id));
    revalidatePath("/settings/members");
    return {
      success: true,
      inviteUrl: inviteUrl(existing.token),
      refreshed: true,
    };
  }

  const token = randomBytes(32).toString("base64url");

  await db.insert(invites).values({
    orgId: auth.orgId,
    email,
    token,
    role: parsed.data.role as "member" | "admin",
    status: "pending",
    invitedBy: auth.userId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  revalidatePath("/settings/members");
  return { success: true, inviteUrl: inviteUrl(token) };
}

export async function revokeInvite(
  inviteId: string,
  context: { orgId: string }
) {
  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) {
    return { error: "Only owners and admins can revoke invites." };
  }

  await db
    .update(invites)
    .set({ status: "revoked" })
    .where(
      and(
        eq(invites.id, inviteId),
        eq(invites.orgId, auth.orgId),
        eq(invites.status, "pending")
      )
    );

  revalidatePath("/settings/members");
  return { success: true };
}

export async function resendInvite(
  inviteId: string,
  context: { orgId: string }
) {
  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) {
    return { error: "Only owners and admins can resend invites." };
  }

  const [invite] = await db
    .select({ id: invites.id, token: invites.token })
    .from(invites)
    .where(
      and(
        eq(invites.id, inviteId),
        eq(invites.orgId, auth.orgId),
        eq(invites.status, "pending")
      )
    );

  if (!invite) return { error: "Invite not found or already used." };

  await db
    .update(invites)
    .set({ expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
    .where(eq(invites.id, invite.id));

  revalidatePath("/settings/members");
  return { success: true, inviteUrl: inviteUrl(invite.token) };
}

const updateRoleSchema = z.object({
  targetUserId: z.string().uuid(),
  newRole: z.enum(["member", "admin"]),
});

export async function updateMemberRole(
  data: { targetUserId: string; newRole: string },
  context: { orgId: string }
) {
  const parsed = updateRoleSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) return { error: "Only owners and admins can change roles." };

  if (parsed.data.targetUserId === auth.userId) {
    return { error: "You cannot change your own role." };
  }

  const [target] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, auth.orgId),
        eq(workspaceMembers.userId, parsed.data.targetUserId),
        eq(workspaceMembers.isActive, true)
      )
    );

  if (!target) return { error: "Member not found." };

  if (target.role === "owner") {
    return { error: "The workspace owner's role cannot be changed." };
  }

  if (ROLE_LEVEL[target.role] >= ROLE_LEVEL[auth.role]) {
    return { error: "You cannot change the role of someone with an equal or higher role." };
  }

  if (ROLE_LEVEL[parsed.data.newRole] > ROLE_LEVEL[auth.role]) {
    return { error: "You cannot assign a role higher than your own." };
  }

  await db
    .update(workspaceMembers)
    .set({ role: parsed.data.newRole as "member" | "admin" })
    .where(
      and(
        eq(workspaceMembers.workspaceId, auth.orgId),
        eq(workspaceMembers.userId, parsed.data.targetUserId)
      )
    );

  revalidatePath("/settings/members");
  return { success: true };
}

export async function removeMember(
  targetUserId: string,
  context: { orgId: string }
) {
  if (!targetUserId || typeof targetUserId !== "string") {
    return { error: "Invalid member ID." };
  }

  const auth = await requireOwnerOrAdmin(context.orgId);
  if (!auth) return { error: "Only owners and admins can remove members." };

  if (targetUserId === auth.userId) {
    return { error: "You cannot remove yourself." };
  }

  const [target] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, auth.orgId),
        eq(workspaceMembers.userId, targetUserId),
        eq(workspaceMembers.isActive, true)
      )
    );

  if (!target) return { error: "Member not found." };

  if (target.role === "owner") {
    return { error: "The workspace owner cannot be removed." };
  }

  if (ROLE_LEVEL[target.role] >= ROLE_LEVEL[auth.role]) {
    return { error: "You cannot remove someone with an equal or higher role." };
  }

  await db
    .update(workspaceMembers)
    .set({ isActive: false })
    .where(
      and(
        eq(workspaceMembers.workspaceId, auth.orgId),
        eq(workspaceMembers.userId, targetUserId)
      )
    );

  revalidatePath("/settings/members");
  return { success: true };
}
