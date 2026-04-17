"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Mark the current user's workspace membership as onboarded.
 *
 * Called on:
 *   - skip ("I'll explore on my own") on Screen 1
 *   - dismiss (×) on Screen 4's first-action card
 *   - completion of the final step
 */
export async function finishOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) throw new Error("No profile");

  await db
    .update(workspaceMembers)
    .set({ onboardedAt: new Date() })
    .where(
      and(
        eq(workspaceMembers.workspaceId, profile.orgId),
        eq(workspaceMembers.userId, user.id)
      )
    );
}
