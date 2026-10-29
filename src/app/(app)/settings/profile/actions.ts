"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, profiles } from "@/db";
import { accountName } from "@/lib/account-name";
import { requireActiveMember, refusal } from "@/lib/auth-guard";

const profileSchema = z.object({
  role: z.enum(["pm", "designer", "developer"]),
});

export async function updateProfileRole(
  data: { role: string },
  context: { orgId: string }
) {
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose a valid role." };

  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("You do not have access to this workspace.") };

  await db
    .update(profiles)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(profiles.id, auth.userId));

  revalidatePath("/settings/profile");
  revalidatePath("/settings/members");
  return { success: true };
}

/**
 * #261: Lane's saved copy of the signed-in person's name catches up with their sign-in account. Settings → Profile
 * calls it when "Manage account" leaves Clerk's live name different from Lane's copy. It takes nothing from the
 * browser: whose name and the name itself come from Clerk for this session. Every page then shows the new name.
 */
export async function syncAccountName() {
  const { userId } = await auth();
  if (!userId) return { error: "Sign in to continue." };
  const user = await currentUser();
  if (!user) return { error: "Sign in to continue." };

  const fullName = accountName({ firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.primaryEmailAddress?.emailAddress });
  const changed = await db
    .update(profiles)
    .set({ fullName, updatedAt: new Date() })
    .where(and(eq(profiles.id, userId), ne(profiles.fullName, fullName)))
    .returning({ id: profiles.id });

  if (changed.length) revalidatePath("/", "layout");
  return { success: true };
}
