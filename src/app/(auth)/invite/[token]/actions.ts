"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db, invites, profiles, workspaceMembers } from "@/db";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/lib/notify";

export async function acceptInvite(token: string) {
  if (!token || typeof token !== "string") {
    return { error: "Invalid invite token." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const [invite] = await db
    .select({
      id: invites.id,
      orgId: invites.orgId,
      email: invites.email,
      role: invites.role,
      status: invites.status,
      expiresAt: invites.expiresAt,
      invitedBy: invites.invitedBy,
    })
    .from(invites)
    .where(eq(invites.token, token));

  if (!invite) return { error: "Invalid invite." };
  if (invite.status !== "pending") return { error: "This invite is no longer valid." };
  if (new Date(invite.expiresAt) < new Date()) return { error: "This invite has expired." };

  const userEmail = (user.email || "").toLowerCase();
  if (userEmail !== invite.email.toLowerCase()) {
    return { error: "This invite was sent to a different email address." };
  }

  const [activeMembership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true))
    );

  if (activeMembership) {
    if (activeMembership.workspaceId === invite.orgId) {
      revalidatePath("/", "layout");
      redirect("/");
    }
    return { error: "You're already in a workspace." };
  }

  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, user.id));

  const fullName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

  await db.transaction(async (tx) => {
    if (existingProfile) {
      await tx
        .update(profiles)
        .set({ orgId: invite.orgId })
        .where(eq(profiles.id, user.id));
    } else {
      await tx.insert(profiles).values({
        id: user.id,
        orgId: invite.orgId,
        fullName,
        email: user.email || "",
        role: "designer",
      });
    }

    const [existingMembership] = await tx
      .select({ isActive: workspaceMembers.isActive })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, invite.orgId),
          eq(workspaceMembers.userId, user.id)
        )
      );

    if (existingMembership) {
      await tx
        .update(workspaceMembers)
        .set({ isActive: true, role: invite.role })
        .where(
          and(
            eq(workspaceMembers.workspaceId, invite.orgId),
            eq(workspaceMembers.userId, user.id)
          )
        );
    } else {
      await tx.insert(workspaceMembers).values({
        workspaceId: invite.orgId,
        userId: user.id,
        role: invite.role,
        isActive: true,
        invitedBy: invite.invitedBy,
      });
    }

    await tx
      .update(invites)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(invites.id, invite.id));
  });

  if (invite.invitedBy) {
    await createNotification({
      userId: invite.invitedBy,
      orgId: invite.orgId,
      type: "invite_accepted",
      requestId: null,
      actorId: user.id,
    });
  }

  revalidatePath("/", "layout");
  redirect("/");
}
