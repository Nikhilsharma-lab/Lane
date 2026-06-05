import { createClient } from "@/lib/supabase/server";
import { db, profiles } from "@/db";
import { eq } from "drizzle-orm";

export type WorkspaceContext = {
  userId: string;
  orgId: string;
  fullName: string;
};

/**
 * Checks if the signed-in user has a profile + workspace.
 * Returns the context if they do, null if not authenticated,
 * or { needsOnboarding: true } if authenticated but no profile.
 *
 * Uses Drizzle for the profile query (direct DB, no RLS) because
 * the Supabase PostgREST client's JWT isn't reliably attached to
 * server-side queries, causing RLS to block profile reads.
 */
export async function getWorkspace(): Promise<
  | (WorkspaceContext & { needsOnboarding: false })
  | { needsOnboarding: true; userId: string; fullName: string; email: string }
  | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Query profile directly via Drizzle (bypasses RLS — safe because
  // we already verified the user's identity via supabase.auth.getUser)
  const [profile] = await db
    .select({ orgId: profiles.orgId, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.id, user.id));

  if (profile) {
    return {
      needsOnboarding: false,
      userId: user.id,
      orgId: profile.orgId,
      fullName: profile.fullName,
    };
  }

  return {
    needsOnboarding: true,
    userId: user.id,
    fullName: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
    email: user.email || "",
  };
}
