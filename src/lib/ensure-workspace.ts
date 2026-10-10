import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

import { db, workspaces } from "@/db";
import { clerkWorkspacePermission, type MemberAuth } from "@/lib/auth-guard";
import { loadShell } from "@/lib/data/shell";

export type WorkspaceContext = {
  userId: string;
  orgId: string;
  role: "admin" | "member" | "guest";
  /** The functional label chosen at onboarding; Settings → Profile edits it. */
  profileRole: "pm" | "designer" | "developer";
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

/**
 * Identity and workspace permission from Clerk claims alone: no database
 * round trip. Plan item 1.8 starts the page's reads from this so they run in
 * parallel with the profile/workspace join in getWorkspace. Cached per
 * request, so the layout and the page share one auth() call.
 */
export const getMember = cache(async function getMember(): Promise<MemberAuth | null> {
  const { userId, orgId, orgRole } = await auth();
  const role = clerkWorkspacePermission(orgRole);
  if (!userId || !orgId || !role) return null;
  return { userId, orgId, role };
});

export const getWorkspace = cache(async function getWorkspace(): Promise<
  | (WorkspaceContext & { needsOnboarding: false })
  | OnboardingContext
  | null
> {
  const member = await getMember();
  if (!member) return null;
  const { userId, orgId, role } = member;

  // Plan item 1.9: profile and workspace in one statement.
  const shell = await loadShell(member);

  if (!shell) {
    const user = await currentUser();
    return {
      needsOnboarding: true,
      userId,
      fullName: displayName(user),
      email: user?.primaryEmailAddress?.emailAddress ?? "",
    };
  }

  let workspaceName = shell.workspaceName;

  if (workspaceName === null) {
    const client = await clerkClient();
    const organization = await client.organizations.getOrganization({
      organizationId: orgId,
    });

    const [workspace] = await db
      .insert(workspaces)
      .values({
        id: organization.id,
        name: organization.name,
        slug: organization.slug ?? organization.id,
        ownerUserId: role === "admin" ? userId : null,
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
    workspaceName = workspace.name;
  }

  return {
    needsOnboarding: false,
    userId,
    orgId,
    role,
    profileRole: shell.profileRole,
    fullName: shell.fullName,
    email: shell.email,
    workspaceName,
  };
});
