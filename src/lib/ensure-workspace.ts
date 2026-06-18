import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { db, profiles, workspaces, workspaceMembers } from "@/db";
import { eq, and } from "drizzle-orm";

export type WorkspaceContext = {
  userId: string;
  orgId: string;
  fullName: string;
  email: string;
  workspaceName: string;
};

export const getWorkspace = cache(async function getWorkspace(): Promise<
  | (WorkspaceContext & { needsOnboarding: false })
  | { needsOnboarding: true; userId: string; fullName: string; email: string }
  | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [row] = await db
    .select({
      orgId: profiles.orgId,
      fullName: profiles.fullName,
      email: profiles.email,
      workspaceName: workspaces.name,
    })
    .from(profiles)
    .innerJoin(workspaces, eq(profiles.orgId, workspaces.id))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, profiles.orgId),
        eq(workspaceMembers.userId, profiles.id),
        eq(workspaceMembers.isActive, true)
      )
    )
    .where(eq(profiles.id, user.id));

  if (row) {
    return {
      needsOnboarding: false,
      userId: user.id,
      orgId: row.orgId,
      fullName: row.fullName,
      email: row.email,
      workspaceName: row.workspaceName,
    };
  }

  return {
    needsOnboarding: true,
    userId: user.id,
    fullName: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
    email: user.email || "",
  };
});
