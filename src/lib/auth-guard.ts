import { auth } from "@clerk/nextjs/server";
import { canChangeThings } from "./role-rules";

/**
 * The four Clerk roles (#210). Admin and Member are paid seats and can change things; Guest is free and
 * changes only their own Requests; Viewer is free and read-only: they read what a Member reads and change
 * nothing. Clerk owns who has which role; Lane only reads it from the session.
 */
export type WorkspacePermission = "admin" | "member" | "guest" | "viewer";
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
  if (orgRole === "org:viewer") return "viewer" as const;
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

/** Admin or Member: "can change things" (#210). Every workspace change a Guest may not make uses this. */
export async function requireCanChange(
  orgId: string
): Promise<MemberAuth | null> {
  const membership = await activeClerkMembership(orgId);
  if (!membership || !canChangeThings(membership.role)) return null;
  return membership;
}

/**
 * Anyone but a Viewer: the changes a Guest may make too (filing, commenting, their own attachments). Which
 * Requests a Guest may touch stays request-access.ts's rule.
 */
export async function requireCanContribute(
  orgId: string
): Promise<MemberAuth | null> {
  const membership = await activeClerkMembership(orgId);
  if (!membership || membership.role === "viewer") return null;
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

/** What every change says to a Viewer (#210). A Viewer already reads everything, so it reveals nothing. */
export const VIEWER_REFUSAL = "You're a Viewer in this workspace, so you can read everything but can't change anything. Ask an Admin if you need to.";

/** Whether the signed-in session is a Viewer's: the reason a change guard said no. */
export async function signedInAsViewer(): Promise<boolean> {
  const { userId, orgRole } = await auth();
  return Boolean(userId) && clerkWorkspacePermission(orgRole) === "viewer";
}

/**
 * The message for a guard that returned null: SESSION_ENDED when there is no
 * signed-in user at all, VIEWER_REFUSAL for a Viewer, otherwise the action's own
 * `copy` (which may hide whether a Request exists). Signed out reveals nothing
 * about the workspace.
 */
export async function refusal(copy: string): Promise<string> {
  const { userId, orgRole } = await auth();
  if (!userId) return SESSION_ENDED;
  return clerkWorkspacePermission(orgRole) === "viewer" ? VIEWER_REFUSAL : copy;
}
