import * as z from "zod"
import type { WorkspacePermission } from "./auth-guard"
import { emailAddressProblem } from "./email-address-rules"
import { canChangeThings, canContribute, canCreateRequests, managesWorkspace, readsWholeWorkspace, ROLE_NAMES, WORKSPACE_ROLES } from "./role-rules"

/**
 * Settings → Members (#210), safe in the browser: the roles an Admin can give, what each one means, and the
 * shapes the invite and role actions accept. Clerk stores every membership and invitation; Lane only asks it.
 */

export { WORKSPACE_ROLES }

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

/** #215: Admins and Members are the paid seats; Guests and Viewers are free. */
export const isPaidSeat = (role: WorkspacePermission | null): boolean => role === "admin" || role === "member"

/** Whether giving someone `to` (who has `from` now, or nothing yet) adds a paid seat: a Guest or Viewer made a Member or Admin, or a new one. */
export const addsPaidSeat = (from: WorkspacePermission | null, to: WorkspacePermission): boolean => isPaidSeat(to) && !isPaidSeat(from)

/** What an Admin confirms before adding a paid seat while billing is enforced (#215), and the server's refusal without it. */
export const PAID_SEAT_CONFIRMATION = "This adds a paid seat"
export const PAID_SEAT_DETAIL = "Admins and Members are paid seats, at least 3. Once this workspace pays, an added seat is charged part-month from the day it’s added, and removing one or making them a Viewer lowers the next bill."
export const CONFIRM_PAID_SEAT = "Confirm that this adds a paid seat."

/** A change that adds a paid seat, waiting for the Admin's confirmation. */
export type PaidSeatChange =
  | { kind: "invite"; email: string; role: WorkspacePermission }
  | { kind: "role"; name: string; role: WorkspacePermission }

const withArticle = (role: WorkspacePermission) => `${role === "admin" ? "an" : "a"} ${ROLE_NAMES[role]}`

/** The change in one sentence, and when its seat starts: an invitation's when they join, a role change's today. */
export function paidSeatSummary(change: PaidSeatChange): string {
  return change.kind === "invite"
    ? `${change.email} is invited as ${withArticle(change.role)}. Their seat starts when they join.`
    : `${change.name} becomes ${withArticle(change.role)}. Their seat starts today.`
}

/** #288 (D27): the invite field's two mistakes get two messages, in the browser and on the server alike. */
const inviteEmailSchema = z.string().trim().toLowerCase().superRefine((email, context) => {
  const problem = emailAddressProblem(email)
  if (problem) context.addIssue({ code: "custom", message: problem })
})

const PAID_ROLES = WORKSPACE_ROLES.filter(isPaidSeat)
const FREE_ROLES = WORKSPACE_ROLES.filter(role => !isPaidSeat(role))
const plural = (roles: WorkspacePermission[]) => roles.map(role => `${ROLE_NAMES[role]}s`).join(" and ")

/**
 * #288 (D28): the invite's seat note. The free roles are named only while they can be given (`offered`), so the note
 * never calls a role free right above saying it isn't available.
 */
export function inviteSeatNote(offered: readonly WorkspacePermission[]): string {
  const free = freeRolesNote(offered)
  return `${plural(PAID_ROLES)} are paid seats.${free ? ` ${free}` : ""}`
}

/** #288 (D28): "Guests and Viewers are free.", for the invite note and Billing's seats, or "" while neither can be given. */
export function freeRolesNote(offered: readonly WorkspacePermission[]): string {
  const free = FREE_ROLES.filter(role => offered.includes(role))
  return free.length ? `${plural(free)} are free.` : ""
}

/** The roles that exist but can't be given in this workspace yet (Clerk custom roles are off), or null for none. */
export function unavailableRolesNote(offered: readonly WorkspacePermission[]): string | null {
  const off = WORKSPACE_ROLES.filter(role => !offered.includes(role))
  if (!off.length) return null
  return `${off.length === 1 ? plural(off) : off.map(role => ROLE_NAMES[role]).join(" and ")} aren’t available in this workspace yet.`
}

const yesNo = (allowed: boolean) => allowed ? "Yes" : "No"
/**
 * #288: "What each role can do" in Settings → Members, read-only. Each answer comes from the shared rules in
 * role-rules.ts, which the server guards enforce too, so the guide can't promise what Lane doesn't grant.
 */
export const ROLE_GUIDE: { label: string; answer: (role: WorkspacePermission) => string }[] = [
  { label: "Read Requests", answer: role => readsWholeWorkspace(role) ? "All" : "Their own" },
  { label: "File Requests", answer: role => yesNo(canCreateRequests(role)) },
  { label: "Comment on Requests", answer: role => !canContribute(role) ? "No" : readsWholeWorkspace(role) ? "All" : "Their own" },
  { label: "Pick up work", answer: role => yesNo(canChangeThings(role)) },
  { label: "See Members", answer: role => yesNo(canChangeThings(role)) },
  { label: "Invite people and change roles", answer: role => yesNo(managesWorkspace(role)) },
]

const roleSchema = z.enum(WORKSPACE_ROLES, { error: "Choose Admin, Member, Guest or Viewer." })

export const inviteInputSchema = z.object({
  email: inviteEmailSchema,
  role: roleSchema,
  confirmedPaidSeat: z.boolean().optional(),
}).strict()

export const roleChangeInputSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  role: roleSchema,
  confirmedPaidSeat: z.boolean().optional(),
}).strict()

export const revokeInvitationInputSchema = z.object({
  invitationId: z.string().trim().min(1).max(200),
}).strict()

/** A pending invitation as Settings → Members lists it. */
export type PendingInvitation = { id: string; email: string; role: WorkspacePermission | null }
/** A person in the workspace as Settings → Members lists it. `role` is null for a role Lane doesn't know. */
export type WorkspaceMember = { userId: string; name: string; email: string; role: WorkspacePermission | null; imageUrl?: string }
