import { auth } from "@clerk/nextjs/server";

export type WorkspacePermission = "admin" | "member" | "guest";
export type MemberAuth = {
  userId: string;
  orgId: string;
  role: WorkspacePermission;
};
export type AdminAuth = MemberAuth & { role: "admin" };

export function clerkWorkspacePermission(orgRole: string | null | undefined) {
  if (orgRole === "org:admin") return "admin" as const;
  if (orgRole === "org:member") return "member" as const;
  if (orgRole === "org:guest") return "guest" as const;
  return null;
}

async function activeClerkMembership(
  expectedOrgId: string
): Promise<MemberAuth | null> {
  const { userId, orgId, orgRole } = await auth();
  const role = clerkWorkspacePermission(orgRole);

  if (!userId || !orgId || orgId !== expectedOrgId || !role) return null;

  return { userId, orgId, role };
}

export async function requireActiveMember(
  orgId: string
): Promise<MemberAuth | null> {
  return activeClerkMembership(orgId);
}

export async function requireMemberOrAbove(
  orgId: string
): Promise<MemberAuth | null> {
  const membership = await activeClerkMembership(orgId);
  if (!membership || membership.role === "guest") return null;
  return membership;
}

export async function requireOwnerOrAdmin(
  orgId: string
): Promise<AdminAuth | null> {
  const membership = await activeClerkMembership(orgId);
  if (!membership || membership.role !== "admin") return null;
  return { ...membership, role: "admin" };
}

/** What a refused action says when the caller is signed out, whatever the
 * action's own refusal. The browser's callAction recognises it, renews the
 * session once and retries (src/lib/action-call.ts). */
export const SESSION_ENDED = "Your session ended. Sign in again to continue.";

/**
 * The message for a guard that returned null: SESSION_ENDED when there is no
 * signed-in user at all, otherwise the action's own `copy` (which may hide
 * whether a Request exists). Signed out reveals nothing about the workspace.
 */
export async function refusal(copy: string): Promise<string> {
  const { userId } = await auth();
  return userId ? copy : SESSION_ENDED;
}
