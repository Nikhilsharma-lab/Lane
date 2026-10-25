import type { WorkspacePermission } from "./auth-guard"

/**
 * What each Clerk role may do, safe in the browser (#210). The server guards in auth-guard.ts enforce the same
 * rules; screens read these only to hide controls a person can't use.
 *
 * - Admin and Member are paid seats and can change things.
 * - Guest is free and changes only their own Requests (request-access-rules.ts).
 * - Viewer is free and read-only: they read what a Member reads, except Members management, and change nothing.
 */

/** The Lane role for a Clerk role key; anything else (a role Lane doesn't know) is null, which means no access. */
export function clerkWorkspacePermission(orgRole: string | null | undefined): WorkspacePermission | null {
  if (orgRole === "org:admin") return "admin"
  if (orgRole === "org:member") return "member"
  if (orgRole === "org:guest") return "guest"
  if (orgRole === "org:viewer") return "viewer"
  return null
}

/** Admin or Member. */
export function canChangeThings(role: WorkspacePermission): boolean {
  return role === "admin" || role === "member"
}

/** Anyone but a Viewer: may file, comment and change their own Requests. */
export function canContribute(role: WorkspacePermission): boolean {
  return role !== "viewer"
}

/** Everyone but a Guest reads the whole workspace (a Guest reads only their own Requests). */
export function readsWholeWorkspace(role: WorkspacePermission): boolean {
  return role !== "guest"
}

/** The role's name as people read it. */
export const ROLE_NAMES: Record<WorkspacePermission, string> = {
  admin: "Admin",
  member: "Member",
  guest: "Guest",
  viewer: "Viewer",
}
