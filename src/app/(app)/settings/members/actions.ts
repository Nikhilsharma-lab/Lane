"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db, invites, workspaceMembers, profiles } from "@/db";
import { eq, and, isNull } from "drizzle-orm";

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["pm", "designer", "developer"]).default("designer"),
});

export async function createInvite(
  formData: { email: string; role?: string },
  context: { userId: string; orgId: string }
) {
  const parsed = inviteSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Check caller is owner or admin of this workspace
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, context.orgId),
        eq(workspaceMembers.userId, context.userId)
      )
    );

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only workspace owners can invite members." };
  }

  // Check if there's already a pending invite for this email
  const [existing] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.orgId, context.orgId),
        eq(invites.email, parsed.data.email.toLowerCase()),
        isNull(invites.acceptedAt)
      )
    );

  if (existing) {
    return { error: "An invite for this email is already pending." };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(invites).values({
    orgId: context.orgId,
    email: parsed.data.email.toLowerCase(),
    token,
    role: parsed.data.role || "designer",
    invitedBy: context.userId,
    expiresAt,
  });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

  revalidatePath("/settings/members");
  return { success: true, inviteUrl };
}
