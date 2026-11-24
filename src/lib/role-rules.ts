import type { WorkspacePermission } from "./auth-guard"

/**
 * What each workspace role may do, safe in the browser (#210). The server guards in auth-guard.ts enforce the same
 * rules; screens read these only to hide controls a person can't use.
 *
 * - Admin and Member are paid seats and can change things.
 * - Guest is free and changes only their own Requests (request-access-rules.ts).
 * - Viewer is free and read-only: they read what a Member reads, except Members management, and change nothing.
 */

/** Every Lane role, in the order Settings lists them. */
export const WORKSPACE_ROLES = ["admin", "member", "guest", "viewer"] as const satisfies readonly WorkspacePermission[]

/** A Lane role, for a value that arrives as a string (a picker's value, a role prop). */
export function isWorkspacePermission(value: string): value is WorkspacePermission {
  return (WORKSPACE_ROLES as readonly string[]).includes(value)
}

/** The Lane role a stored role names; null for none, or one Lane doesn't know, which grants nothing. */
export const laneRole = (stored: string | null | undefined): WorkspacePermission | null => (stored && isWorkspacePermission(stored) ? stored : null)

/** Admin or Member. */
export function canChangeThings(role: WorkspacePermission): boolean {
  return role === "admin" || role === "member"
}

/** #215: the paid seats are the Admins and Members, who can change things; Guests and Viewers are free. */
export const isPaidSeat = (role: WorkspacePermission | null): boolean => role !== null && canChangeThings(role)
export const PAID_ROLES = WORKSPACE_ROLES.filter(isPaidSeat)
export const FREE_ROLES = WORKSPACE_ROLES.filter((role) => !isPaidSeat(role))

/** Admin only: invites people, changes roles and runs the workspace's settings (Billing, Slack). */
export function managesWorkspace(role: WorkspacePermission): boolean {
  return role === "admin"
}

/** Anyone but a Viewer: may file, comment and change their own Requests. */
export function canContribute(role: WorkspacePermission): boolean {
  return role !== "viewer"
}

/**
 * #285: who can create Requests, the one rule behind every New Request (the list's Open group, /intake, Impact, the
 * sidebar, C and the palette). A Viewer files nothing. A Guest still files their own Requests until #314 changes it here.
 */
export function canCreateRequests(role: WorkspacePermission): boolean {
  return role !== "viewer"
}

/** Everyone but a Guest reads the whole workspace (a Guest reads only their own Requests). */
export function readsWholeWorkspace(role: WorkspacePermission): boolean {
  return role !== "guest"
}

/**
 * #269 (A113): the account menu's Members item. Admins and Members see the Members page (a Viewer and a Guest
 * don't); only an Admin invites people and changes their roles, so a Member's item says just "Members".
 */
export function membersItemLabel(role: WorkspacePermission): string | undefined {
  if (!canChangeThings(role)) return undefined
  return role === "admin" ? "Invite and manage members" : "Members"
}

/** The role's name as people read it. */
export const ROLE_NAMES: Record<WorkspacePermission, string> = {
  admin: "Admin",
  member: "Member",
  guest: "Guest",
  viewer: "Viewer",
}
