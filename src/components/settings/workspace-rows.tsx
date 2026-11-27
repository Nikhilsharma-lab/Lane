"use client"

import { leaveWorkspace, renameWorkspace } from "@/app/(app)/settings/workspace-actions"
import { callAction } from "@/lib/action-call"
import type { AuthAnswer } from "@/lib/auth-answer"
import type { WorkspacePermission } from "@/lib/auth-guard"
import { LeaveWorkspaceRow } from "./leave-workspace-row"
import { PEOPLE_LIST_HREF, showPeopleList } from "./people-list"
import { WorkspaceNameRow } from "./workspace-name-row"

/** Settings → Workspace details: the workspace's name, which an Admin changes (#395). */
export function WorkspaceName({ orgId, name, role }: { orgId: string; name: string; role: WorkspacePermission }) {
  return <WorkspaceNameRow name={name} role={role} onRename={next => callAction(() => renameWorkspace({ name: next }, { orgId }))} />
}

/** Settings → Workspace details: leaving the workspace, for every role (#395). */
export function LeaveWorkspace({ orgId, workspaceName, onlyAdmin }: { orgId: string; workspaceName: string; onlyAdmin: boolean }) {
  return <LeaveWorkspaceRow workspaceName={workspaceName} onlyAdmin={onlyAdmin} peopleList={PEOPLE_LIST_HREF} onPeopleList={showPeopleList}
    onLeave={() => leaveThenOpenLane(() => callAction(() => leaveWorkspace({ orgId })))} />
}

/** Leaves, then loads `/` in full: it opens another of the person's workspaces, or Onboarding. */
export async function leaveThenOpenLane(leave: () => Promise<AuthAnswer>): Promise<AuthAnswer> {
  const answer = await leave()
  if (answer.ok) window.location.replace("/")
  return answer
}
