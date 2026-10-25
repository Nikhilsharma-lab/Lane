import { z } from "zod"
import type { WorkspacePermission } from "./auth-guard"

/**
 * Settings → Members (#210), safe in the browser: the roles an Admin can give, what each one means, and the
 * shapes the invite and role actions accept. Clerk stores every membership and invitation; Lane only asks it.
 */

export const WORKSPACE_ROLES = ["admin", "member", "guest", "viewer"] as const satisfies readonly WorkspacePermission[]

/** Admin and Member always; Guest and Viewer only while the custom roles switch is on (Clerk Enhanced B2B). */
export function rolesOffered(customRolesOn: boolean): WorkspacePermission[] {
  return customRolesOn ? [...WORKSPACE_ROLES] : ["admin", "member"]
}

/** One line per role, as the invite form and role picker explain it. Paid seats are Admin and Member. */
export const ROLE_DESCRIPTIONS: Record<WorkspacePermission, string> = {
  admin: "Paid seat. Everything a Member does, plus inviting people, changing roles and workspace settings.",
  member: "Paid seat. Files, reviews, picks up, releases and closes Requests.",
  guest: "Free. Files Requests and sees and comments on only their own.",
  viewer: "Free. Reads everything a Member reads, including Impact, and changes nothing.",
}

/** The Clerk role key for a Lane role. */
export function clerkRoleOf(role: WorkspacePermission): `org:${WorkspacePermission}` {
  return `org:${role}`
}

const roleSchema = z.enum(WORKSPACE_ROLES, { error: "Choose Admin, Member, Guest or Viewer." })

export const inviteInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter an email address." }).max(320, "Enter an email address.")),
  role: roleSchema,
}).strict()

export const roleChangeInputSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  role: roleSchema,
}).strict()

export const revokeInvitationInputSchema = z.object({
  invitationId: z.string().trim().min(1).max(200),
}).strict()

/** A pending invitation as Settings → Members lists it. */
export type PendingInvitation = { id: string; email: string; role: WorkspacePermission | null }
/** A person in the workspace as Settings → Members lists it. `role` is null for a role Lane doesn't know. */
export type WorkspaceMember = { userId: string; name: string; email: string; role: WorkspacePermission | null; imageUrl?: string }
