"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, profiles } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";

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
  if (!auth) return { error: "You do not have access to this workspace." };

  await db
    .update(profiles)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(profiles.id, auth.userId));

  revalidatePath("/settings/profile");
  revalidatePath("/settings/members");
  return { success: true };
}
