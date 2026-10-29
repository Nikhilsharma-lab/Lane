"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";

import { db, profiles } from "@/db";
import { accountName } from "@/lib/account-name";
import { clerkWorkspacePermission } from "@/lib/auth-guard";

const onboardingRoleSchema = z.object({
  role: z.enum(["pm", "designer", "developer"]),
});

function userDisplayName(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  return accountName({ firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.primaryEmailAddress?.emailAddress });
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
  if (!user) return { error: "Could not load your profile. Refresh the page and try again." };

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

  // Plan item 2.2: the saved role and the welcome arrive in one response.
  // Signing in soft-navigates to /, whose layout redirects here, and with
  // staleTimes.dynamic at 30 s the client router keeps that redirect for /.
  // A client navigation to / inside those 30 s would replay it.
  // - The redirect makes this response carry a fresh render of /, so
  //   /onboarding is never rendered again and no second request is needed.
  // - The revalidation is what stops the cached segments winning: a navigation
  //   seeded by an action that did not revalidate still reads the client's
  //   cache before the seed (Next 16.2 ppr-navigations, FreshnessPolicy.Default).
  // RoleForm treats the redirect's rejection as the success.
  revalidatePath("/");
  redirect("/", RedirectType.replace);
}
