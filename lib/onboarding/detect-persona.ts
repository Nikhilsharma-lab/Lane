import { db } from "@/db";
import {
  profiles,
  teamMemberships,
  teams,
  workspaceMembers,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type OnboardingVariant = "design_head" | "designer" | "pm";

/**
 * Detect which onboarding flow a user should see.
 *
 * Precedence (per onboarding-spec section 3):
 *   1. design_head — workspace owner or admin (full 4-screen flow)
 *   2. pm          — team teamRole === 'pm' on any team, OR profiles.role === 'pm'
 *   3. designer    — everyone else (lightest 2-screen flow)
 *
 * Ambiguous / no-membership cases default to 'designer'.
 */
export async function detectOnboardingVariant(
  userId: string,
  workspaceId: string
): Promise<OnboardingVariant> {
  // 1. Workspace-level role → design_head?
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    );

  if (membership?.role === "owner" || membership?.role === "admin") {
    return "design_head";
  }

  // 2. PM on any team in this workspace?
  const [pmTeam] = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        eq(teamMemberships.userId, userId),
        eq(teamMemberships.teamRole, "pm"),
        eq(teams.orgId, workspaceId)
      )
    )
    .limit(1);

  if (pmTeam) return "pm";

  // 3. Fallback: workspace-level profile.role === 'pm' (user not yet on a team)
  const [profile] = await db
    .select({ role: profiles.role, orgId: profiles.orgId })
    .from(profiles)
    .where(eq(profiles.id, userId));

  if (profile?.role === "pm" && profile.orgId === workspaceId) {
    return "pm";
  }

  // 4. Default
  return "designer";
}
