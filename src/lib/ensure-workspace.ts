import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { db, profiles, workspaces } from "@/db";
import { clerkWorkspacePermission } from "@/lib/auth-guard";

export type WorkspaceContext = {
  userId: string;
  orgId: string;
  role: "admin" | "member" | "guest";
  fullName: string;
  email: string;
  workspaceName: string;
};

type OnboardingContext = {
  needsOnboarding: true;
  userId: string;
  fullName: string;
  email: string;
};

function displayName(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "User";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.username || user.primaryEmailAddress?.emailAddress || "User";
}

export const getWorkspace = cache(async function getWorkspace(): Promise<
  | (WorkspaceContext & { needsOnboarding: false })
  | OnboardingContext
  | null
> {
  const { userId, orgId, orgRole } = await auth();
  const permission = clerkWorkspacePermission(orgRole);
  if (!userId || !orgId || !permission) return null;

  const [profile] = await db
    .select({
      fullName: profiles.fullName,
      email: profiles.email,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.id, userId));

  if (!profile) {
    const user = await currentUser();
    return {
      needsOnboarding: true,
      userId,
      fullName: displayName(user),
      email: user?.primaryEmailAddress?.emailAddress ?? "",
    };
  }

  let [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, orgId));

  if (!workspace) {
    const client = await clerkClient();
    const organization = await client.organizations.getOrganization({
      organizationId: orgId,
    });

    [workspace] = await db
      .insert(workspaces)
      .values({
        id: organization.id,
        name: organization.name,
        slug: organization.slug ?? organization.id,
        ownerUserId: permission === "admin" ? userId : null,
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: {
          name: organization.name,
          slug: organization.slug ?? organization.id,
          updatedAt: new Date(),
        },
      })
      .returning({ name: workspaces.name });
  }

  return {
    needsOnboarding: false,
    userId,
    orgId,
    role: permission,
    fullName: profile.fullName,
    email: profile.email,
    workspaceName: workspace.name,
  };
});
