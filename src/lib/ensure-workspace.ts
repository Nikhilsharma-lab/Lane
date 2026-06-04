import { createClient } from "@/lib/supabase/server";

/**
 * Ensures the signed-in user has a profile + workspace.
 * If not, calls the bootstrap_organization_membership RPC to create defaults.
 *
 * NOT a server action — plain server-side utility. Called once from pages,
 * result passed to actions that need orgId/userId.
 */
export async function ensureWorkspace(): Promise<{
  userId: string;
  orgId: string;
  fullName: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Check if profile already exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, full_name")
    .eq("id", user.id)
    .single();

  if (profile) {
    return {
      userId: user.id,
      orgId: profile.org_id,
      fullName: profile.full_name,
    };
  }

  // No profile — bootstrap a default workspace
  const fullName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const email = user.email || "";
  const slug = email.split("@")[0]?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || `workspace-${Date.now()}`;
  const orgName = `${fullName}'s Workspace`;

  const { data: bootstrapResult, error } = await supabase.rpc(
    "bootstrap_organization_membership",
    {
      target_user_id: user.id,
      target_org_name: orgName,
      target_org_slug: slug,
      target_full_name: fullName,
      target_email: email,
    }
  );

  if (error) {
    console.error("[ensure-workspace] bootstrap failed:", error.message);
    return null;
  }

  const row = bootstrapResult?.[0];
  if (!row) {
    console.error("[ensure-workspace] bootstrap returned no data");
    return null;
  }

  return { userId: user.id, orgId: row.org_id, fullName };
}
