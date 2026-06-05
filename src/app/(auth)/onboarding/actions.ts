"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const onboardingSchema = z.object({
  workspaceName: z.string().min(2, "Workspace name must be at least 2 characters").max(100),
  role: z.enum(["pm", "designer", "developer"]),
});

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
  const slug = parsed.data.workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || `workspace-${user.id.slice(0, 8)}`;

  const { error } = await supabase.rpc("bootstrap_organization_membership", {
    target_user_id: user.id,
    target_org_name: parsed.data.workspaceName,
    target_org_slug: slug,
    target_full_name: fullName,
    target_email: email,
    target_role: parsed.data.role,
  });

  if (error) {
    console.error("[onboarding] bootstrap failed:", error.message);
    return { error: "Failed to create workspace. Please try again." };
  }

  redirect("/");
}
