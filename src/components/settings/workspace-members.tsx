"use client";

import { changeMemberRole, inviteToWorkspace, removeMember, revokeInvitation } from "@/app/(app)/settings/members/actions";
import { useServerRefresh } from "@/components/requests/use-optimistic-action";
import { callAction } from "@/lib/action-call";
import type { MemberLists } from "@/lib/data/members";
import { WorkspaceMembersView } from "./workspace-members-view";

export type WorkspaceMembersProps = {
  orgId: string; workspaceName: string; selfId: string; canManage: boolean; confirmPaidSeats: boolean;
  /** Null when the lists couldn't be read; Try again reads the page's server data again. */
  lists: MemberLists | null;
};

/**
 * #210 Settings → Members. #396: the server reads the people and, for an Admin, the pending invitations. Every change
 * goes through Lane's Server Actions, whose answers carry the page's server data read again.
 */
export function WorkspaceMembers({ orgId, workspaceName, selfId, canManage, confirmPaidSeats, lists }: WorkspaceMembersProps) {
  const refresh = useServerRefresh();
  return <WorkspaceMembersView people={lists?.people ?? []} invitations={lists?.invitations ?? []} state={lists ? "ready" : "error"} onRetry={refresh}
    selfId={selfId} canManage={canManage} confirmPaidSeats={confirmPaidSeats}
    onInvite={(email, role, confirmedPaidSeat) => inviteToWorkspace({ email, role, confirmedPaidSeat }, { orgId })}
    onChangeRole={(userId, role, confirmedPaidSeat) => changeMemberRole({ userId, role, confirmedPaidSeat }, { orgId })}
    onRevoke={invitationId => revokeInvitation({ invitationId }, { orgId })}
    remove={{ workspaceName, onRemove: userId => callAction(() => removeMember({ userId }, { orgId })) }} />;
}
