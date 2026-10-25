import type { ReactNode } from "react";
import { ClerkMembersProfile } from "@/components/auth/clerk-members-profile";
import { WorkspaceMembersLoader } from "@/components/settings/workspace-members-loader";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { billingEnforced, customRoles } from "@/lib/feature-switches";
import { rolesOffered } from "@/lib/member-role-rules";
import { canChangeThings } from "@/lib/role-rules";

/**
 * #210 Settings → Members, as every Settings page renders it. Admins and Members see the people and their roles;
 * an Admin also invites, changes roles, revokes invitations and (in Clerk) removes people. Viewers and Guests get
 * no Members section. Guest and Viewer are offered only while `LANE_CUSTOM_ROLES` is on (Clerk Enhanced B2B).
 * While billing is enforced, an Admin confirms each paid seat before adding it (#215).
 */
export function membersPanel(workspace: Pick<WorkspaceContext, "orgId" | "userId" | "role">): ReactNode {
  if (!canChangeThings(workspace.role)) return undefined;
  const admin = workspace.role === "admin";
  return <>
    <WorkspaceMembersLoader orgId={workspace.orgId} selfId={workspace.userId} canManage={admin} roles={rolesOffered(customRoles())} confirmPaidSeats={admin && billingEnforced()} />
    {admin && <ClerkMembersProfile />}
  </>;
}
