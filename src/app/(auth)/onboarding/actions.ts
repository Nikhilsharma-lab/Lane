"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db, workspaces, profiles, workspaceMembers } from "@/db";
import { eq } from "drizzle-orm";

const onboardingSchema = z.object({
  workspaceName: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(100),
  role: z.enum(["pm", "designer", "developer"]),
});

const MAX_SLUG_ATTEMPTS = 10;

export async function completeOnboarding(formData: {
  workspaceName: string;
  role: string;
}) {
  const parsed = onboardingSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in" };

  const fullName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const email = user.email || "";
  const baseSlug =
    parsed.data.workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `workspace-${user.id.slice(0, 8)}`;

  // Idempotent: if profile already exists, user already onboarded
  const [existingProfile] = await db
    .select({ orgId: profiles.orgId })
    .from(profiles)
    .where(eq(profiles.id, user.id));

  if (existingProfile) {
    redirect("/");
  }

  // Slug retry loop — retries the full transaction on slug collision
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
    try {
      await db.transaction(async (tx) => {
        const [org] = await tx
          .insert(workspaces)
          .values({ name: parsed.data.workspaceName, slug })
          .returning({ id: workspaces.id });

        await tx.insert(profiles).values({
          id: user.id,
          orgId: org.id,
          fullName,
          email,
          role: parsed.data.role as "pm" | "designer" | "developer",
        });

        await tx.insert(workspaceMembers).values({
          workspaceId: org.id,
          userId: user.id,
          role: "owner",
        });
      });

      redirect("/");
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as Record<string, unknown>).code === "23505"
      ) {
        continue;
      }
      throw err;
    }
  }

  return {
    error: "Could not generate unique workspace slug. Please try a different name.",
  };
}
