"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, profiles } from "@/db";
import { clerkWorkspacePermission } from "@/lib/auth-guard";

const onboardingRoleSchema = z.object({
  role: z.enum(["pm", "designer", "developer"]),
});

function userDisplayName(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.username || user.primaryEmailAddress?.emailAddress || "User";
}

export async function saveOnboardingRole(data: { role: string }) {
  const parsed = onboardingRoleSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose a valid role." };

  const { userId, orgId, orgRole } = await auth();
  if (!userId) return { error: "Sign in to continue." };
  if (!orgId || !clerkWorkspacePermission(orgRole)) {
    return { error: "Create or join a workspace before choosing your role." };
  }

  const user = await currentUser();
  if (!user) return { error: "Lane could not load your Clerk profile." };

  await db
    .insert(profiles)
    .values({
      id: userId,
      fullName: userDisplayName(user),
      email: user.primaryEmailAddress?.emailAddress ?? "",
      role: parsed.data.role,
      avatarUrl: user.imageUrl,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        fullName: userDisplayName(user),
        email: user.primaryEmailAddress?.emailAddress ?? "",
        role: parsed.data.role,
        avatarUrl: user.imageUrl,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/onboarding");
  return { success: true as const };
}
