import type { ReactNode } from "react";
import { WorkspaceMembersLoader } from "@/components/settings/workspace-members-loader";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { billingEnforced } from "@/lib/feature-switches";
import { canChangeThings } from "@/lib/role-rules";

/**
 * #210 Settings → Members, as every Settings page renders it. Admins and Members see the people and their roles;
 * an Admin also invites, changes roles, revokes invitations and (in Clerk) removes people; all of it, the Clerk removal
 * row and the role guide included, loads with the Members section (#288). Viewers and Guests get
 * no Members section. All four roles are offered in every workspace (#393).
 * While billing is enforced, an Admin confirms each paid seat before adding it (#215).
 */
export function membersPanel(workspace: Pick<WorkspaceContext, "orgId" | "userId" | "role">): ReactNode {
  if (!canChangeThings(workspace.role)) return undefined;
  const admin = workspace.role === "admin";
  return <WorkspaceMembersLoader orgId={workspace.orgId} selfId={workspace.userId} canManage={admin} confirmPaidSeats={admin && billingEnforced()} />;
}
