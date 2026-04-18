"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  projectMembers,
  requests,
  teams,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Delete the sample team and all its associated data for the current user's
 * workspace. Noop if no sample team exists.
 *
 * FK-safe delete order (requests.projectId is onDelete: "set null", not cascade,
 * so requests must be deleted explicitly before the team):
 *   1. requests with projectId = sampleTeam.id
 *   2. project_members with teamId = sampleTeam.id
 *   3. profiles where isSample = true AND orgId matches
 *   4. the sample team itself
 */
export async function clearSampleTeam() {
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

  const orgId = profile.orgId;

  const [sampleTeam] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.orgId, orgId), eq(teams.isSample, true)));

  if (!sampleTeam) return; // no-op

  await db.delete(requests).where(eq(requests.projectId, sampleTeam.id));
  await db
    .delete(projectMembers)
    .where(eq(projectMembers.teamId, sampleTeam.id));
  await db
    .delete(profiles)
    .where(and(eq(profiles.orgId, orgId), eq(profiles.isSample, true)));
  await db.delete(teams).where(eq(teams.id, sampleTeam.id));
}
