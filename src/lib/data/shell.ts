import "server-only";

import { eq } from "drizzle-orm";

import { db, profiles, workspaces } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";

export type ShellRow = {
  fullName: string;
  email: string;
  /** The functional label saved at onboarding (pm, designer, developer), not the workspace role. */
  profileRole: "pm" | "designer" | "developer";
  workspaceName: string;
};

/**
 * Plan item 1.9: the profile and the workspace in one statement. Identity and
 * the workspace permission come from the session seam (`auth.role`), so the only
 * database work on the shell's critical path is this join. Returns null
 * without a profile or workspace row, which a member row always has.
 */
export async function loadShell(auth: MemberAuth): Promise<ShellRow | null> {
  const [row] = await db
    .select({
      fullName: profiles.fullName,
      email: profiles.email,
      profileRole: profiles.role,
      workspaceName: workspaces.name,
    })
    .from(profiles)
    .innerJoin(workspaces, eq(workspaces.id, auth.orgId))
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  return row ?? null;
}
