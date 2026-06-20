"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";

const onboardingSchema = z.object({
  fullName: z
    .string()
    .min(1, "Full name is required")
    .max(200),
  workspaceName: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(100),
  role: z.enum(["pm", "designer", "developer"]),
});

export async function completeOnboarding(formData: {
  fullName: string;
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
    parsed.data.fullName ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";
  const email = user.email || "";
  const baseSlug =
    parsed.data.workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `workspace-${user.id.slice(0, 8)}`;

  let orgId: string;
  try {
    const result = await db.execute(
      sql`SELECT * FROM bootstrap_organization_membership(
        ${user.id}::uuid,
        ${parsed.data.workspaceName},
        ${baseSlug},
        ${fullName},
        ${email},
        ${parsed.data.role}
      )`
    );
    orgId = (result as unknown as Array<{ org_id: string }>)[0]?.org_id;
    if (!orgId) throw new Error("bootstrap returned no org_id");
  } catch (err) {
    console.error("[onboarding] bootstrap failed:", err);
    return {
      error: "Failed to create workspace. Please try again.",
    };
  }

  revalidatePath("/");
  return { success: true as const, orgId };
}
