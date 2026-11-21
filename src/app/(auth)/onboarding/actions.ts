"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import * as z from "zod";

import { db, profiles } from "@/db";
import { activeMemberOf } from "@/lib/auth-guard";
import { readAccount, readSession } from "@/lib/session";

const onboardingRoleSchema = z.object({
  role: z.enum(["pm", "designer", "developer"]),
});

export async function saveOnboardingRole(data: { role: string }) {
  const parsed = onboardingRoleSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose a valid role." };

  const session = await readSession();
  if (!session) return { error: "Sign in to continue.", sessionExpired: true as const };
  if (!activeMemberOf(session)) {
    // #290: the role step links this message to the create-workspace step.
    return { error: "Create or join a workspace before choosing your role.", needsWorkspace: true as const };
  }

  const account = await readAccount();
  if (!account) return { error: "Couldn’t load your profile. Refresh the page and try again." };

  await db
    .insert(profiles)
    .values({
      id: session.userId,
      fullName: account.name,
      email: account.email,
      role: parsed.data.role,
      avatarUrl: account.imageUrl,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        fullName: account.name,
        email: account.email,
        role: parsed.data.role,
        avatarUrl: account.imageUrl,
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
