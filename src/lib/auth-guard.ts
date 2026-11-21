import type { ActionFailure } from "./action-session-failure";
import { canChangeThings } from "./role-rules";
import { readSession } from "./session";

/** Clerk owns workspace membership. Profile labels never grant these capabilities. */
export type WorkspacePermission = "admin" | "member" | "guest" | "viewer";
export type MemberAuth = { userId: string; orgId: string; role: WorkspacePermission };
export type AdminAuth = MemberAuth & { role: "admin" };
export type WorkspaceScope = Pick<MemberAuth, "orgId">;
export type WorkspacePerson = Pick<MemberAuth, "orgId" | "userId">;

export const SESSION_ENDED = "Your session ended. Sign in again to continue.";
export const VIEWER_REFUSAL = "You’re a Viewer in this workspace, so you can read everything but can’t change anything. Ask an Admin if you need to.";

/** One session snapshot decides identity, workspace and expiry before any change.
 * Wrong-workspace, role and validation refusals never permit a session replay. */
export async function guardActiveMember(orgId: string, copy: string): Promise<MemberAuth | ActionFailure> {
  const session = await readSession();
  if (!session) return { error: SESSION_ENDED, sessionExpired: true };
  if (!session.orgId || session.orgId !== orgId || !session.role) return { error: copy };
  return { userId: session.userId, orgId: session.orgId, role: session.role };
}

/** Admin or Member may change shared workspace data. */
export async function guardCanChange(orgId: string, copy: string): Promise<MemberAuth | ActionFailure> {
  const membership = await guardActiveMember(orgId, copy);
  if ("error" in membership) return membership;
  if (membership.role === "viewer") return { error: VIEWER_REFUSAL };
  return canChangeThings(membership.role) ? membership : { error: copy };
}

/** Guests may contribute to their own Requests; request-access enforces ownership. */
export async function guardCanContribute(orgId: string, copy: string): Promise<MemberAuth | ActionFailure> {
  const membership = await guardActiveMember(orgId, copy);
  if ("error" in membership) return membership;
  return membership.role === "viewer" ? { error: VIEWER_REFUSAL } : membership;
}

export async function guardOwnerOrAdmin(orgId: string, copy: string): Promise<AdminAuth | ActionFailure> {
  const membership = await guardActiveMember(orgId, copy);
  if ("error" in membership) return membership;
  if (membership.role === "viewer") return { error: VIEWER_REFUSAL };
  return membership.role === "admin" ? { ...membership, role: "admin" } : { error: copy };
}

// Read-route compatibility: a denial remains null, never a truthy failure object.
export async function requireActiveMember(orgId: string): Promise<MemberAuth | null> {
  const membership = await guardActiveMember(orgId, "");
  return "error" in membership ? null : membership;
}
export async function requireCanChange(orgId: string): Promise<MemberAuth | null> {
  const membership = await guardCanChange(orgId, "");
  return "error" in membership ? null : membership;
}
export async function requireCanContribute(orgId: string): Promise<MemberAuth | null> {
  const membership = await guardCanContribute(orgId, "");
  return "error" in membership ? null : membership;
}
export async function requireOwnerOrAdmin(orgId: string): Promise<AdminAuth | null> {
  const membership = await guardOwnerOrAdmin(orgId, "");
  return "error" in membership ? null : membership;
}
