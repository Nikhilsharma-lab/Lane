import { Suspense, type ReactNode } from "react";
import { Placeholder } from "@/components/loading/placeholder";
import { WorkspaceMembersLoader } from "@/components/settings/workspace-members-loader";
import { loadMembers } from "@/lib/data/members";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { billingEnforced } from "@/lib/feature-switches";
import { canChangeThings } from "@/lib/role-rules";

type MembersWorkspace = Pick<WorkspaceContext, "orgId" | "userId" | "role" | "workspaceName">;

/**
 * #210 Settings → Members, as every Settings page renders it. Admins and Members see the people and their roles;
 * an Admin also invites, changes roles, revokes invitations and removes people. Viewers and Guests get no Members
 * section. All four roles are offered in every workspace (#393).
 * While billing is enforced, an Admin confirms each paid seat before adding it (#215).
 * #396: the lists are read on the server and streamed, so they hold up no Settings page.
 */
export function membersPanel(workspace: MembersWorkspace): ReactNode {
  if (!canChangeThings(workspace.role)) return undefined;
  return <Suspense fallback={<Placeholder label="Loading people…" lines={3} />}><MembersSection workspace={workspace} /></Suspense>;
}

async function MembersSection({ workspace }: { workspace: MembersWorkspace }) {
  const admin = workspace.role === "admin";
  const lists = await loadMembers(workspace, workspace.role).catch(() => {
    console.error("[members] could not be read");
    return null;
  });
  return <WorkspaceMembersLoader orgId={workspace.orgId} workspaceName={workspace.workspaceName} selfId={workspace.userId} canManage={admin}
    confirmPaidSeats={admin && billingEnforced()} lists={lists} />;
}
