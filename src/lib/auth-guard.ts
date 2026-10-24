import { auth } from "@clerk/nextjs/server";
import type { ActionFailure } from "./action-session-failure";

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

export const SESSION_ENDED = "Your session ended. Sign in again to continue.";

/** One session snapshot determines identity, permission and expiry. Only a
 * missing signed-in user permits replay; a workspace/role denial never does. */
export async function guardActiveMember(orgId: string, copy: string): Promise<MemberAuth | ActionFailure> {
  const session = await auth();
  if (!session.userId) return { error: SESSION_ENDED, sessionExpired: true };
  const role = clerkWorkspacePermission(session.orgRole);
  if (!session.orgId || session.orgId !== orgId || !role) return { error: copy };
  return { userId: session.userId, orgId: session.orgId, role };
}

export async function guardMemberOrAbove(orgId: string, copy: string): Promise<MemberAuth | ActionFailure> {
  const membership = await guardActiveMember(orgId, copy);
  if ("error" in membership) return membership;
  return membership.role === "guest" ? { error: copy } : membership;
}

// Read-route compatibility: failures remain null, never truthy failure objects.
export async function requireActiveMember(orgId: string): Promise<MemberAuth | null> {
  const membership = await guardActiveMember(orgId, "");
  return "error" in membership ? null : membership;
}
export async function requireMemberOrAbove(orgId: string): Promise<MemberAuth | null> {
  const membership = await guardMemberOrAbove(orgId, "");
  return "error" in membership ? null : membership;
}
export async function requireOwnerOrAdmin(orgId: string): Promise<AdminAuth | null> {
  const membership = await requireActiveMember(orgId);
  return membership?.role === "admin" ? { ...membership, role: "admin" } : null;
}
