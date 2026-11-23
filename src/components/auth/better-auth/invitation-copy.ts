import { authErrorCopy } from "@/lib/auth-error-copy"
import type { WorkspacePermission } from "@/lib/auth-guard"
import { ROLE_NAMES } from "@/lib/role-rules"

/** A Lane role as a sentence reads it: "an Admin", "a Member". */
export const withArticle = (role: WorkspacePermission) => `${/^[AEIOU]/.test(ROLE_NAMES[role]) ? "an" : "a"} ${ROLE_NAMES[role]}`

export type InvitationRefusal = { title: string; detail: string }

/**
 * #379: the words for an invitation that can't be joined, the same on the invitation page and on Onboarding's Join.
 * Null for any other code, whose line comes from `authErrorCopy` alone.
 */
export function invitationRefusal(code: string | undefined, workspace: string): InvitationRefusal | null {
  // #346's workspace-full state. Proposed for Nikhil: "then try again" for the prototype's "then open this link
  // again", because both screens offer Try again or Join right there.
  if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED")
    return { title: `${workspace} is full`, detail: `A workspace holds up to 100 people. Ask an Admin of ${workspace} to make room, then try again.` }
  // Expired, cancelled or already accepted: the server can't say which, so #346's can't-be-used title takes the
  // table's line.
  if (code === "INVITATION_NOT_FOUND") return { title: "This invitation can’t be used", detail: authErrorCopy(code) }
  return null
}
