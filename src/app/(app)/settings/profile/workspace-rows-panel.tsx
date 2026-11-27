import type { SharedPanels } from "@/components/settings/settings-command-adapter";
import { LeaveWorkspaceLoader, WorkspaceNameLoader } from "@/components/settings/workspace-rows-loader";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { isOnlyAdmin } from "@/lib/workspace-roster";

/** #395 Settings → Workspace details, as every Settings page renders it: the name row and the Leave row, for all four roles. */
export async function workspaceRowsPanel({ orgId, userId, role, workspaceName }: Pick<WorkspaceContext, "orgId" | "userId" | "role" | "workspaceName">): Promise<Pick<SharedPanels, "workspaceNameRow" | "leaveWorkspace">> {
  const onlyAdmin = role === "admin" && await isOnlyAdmin(orgId, userId);
  return {
    workspaceNameRow: <WorkspaceNameLoader orgId={orgId} name={workspaceName} role={role} />,
    leaveWorkspace: <LeaveWorkspaceLoader orgId={orgId} workspaceName={workspaceName} onlyAdmin={onlyAdmin} />,
  };
}
