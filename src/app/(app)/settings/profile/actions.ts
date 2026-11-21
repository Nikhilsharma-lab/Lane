"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import * as z from "zod";
import { db, profiles } from "@/db";
import { guardActiveMember } from "@/lib/auth-guard";
import { readAccount } from "@/lib/session";

const profileSchema = z.object({
  role: z.enum(["pm", "designer", "developer"]),
});

export async function updateProfileRole(
  data: { role: string },
  context: { orgId: string }
) {
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose a valid role." };

  const auth = await guardActiveMember(context.orgId, "You do not have access to this workspace.");
  if ("error" in auth) return auth;

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
 * browser but the workspace it was rendered in: whose name comes from the session's guard and the name itself from
 * the signed-in account. Every page then shows the new name.
 */
export async function syncAccountName(context: { orgId: string }) {
  const auth = await guardActiveMember(context.orgId, "You do not have access to this workspace.");
  if ("error" in auth) return auth;
  const account = await readAccount();
  if (!account) return { error: "You do not have access to this workspace." };

  const fullName = account.name;
  const changed = await db
    .update(profiles)
    .set({ fullName, updatedAt: new Date() })
    .where(and(eq(profiles.id, auth.userId), ne(profiles.fullName, fullName)))
    .returning({ id: profiles.id });

  if (changed.length) revalidatePath("/", "layout");
  return { success: true };
}
