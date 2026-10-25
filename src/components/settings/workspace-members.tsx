"use client";

import { useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect } from "react";
import { changeMemberRole, inviteToWorkspace, revokeInvitation } from "@/app/(app)/settings/members/actions";
import type { WorkspacePermission } from "@/lib/auth-guard";
import { clerkWorkspacePermission } from "@/lib/role-rules";
import type { PendingInvitation, WorkspaceMember } from "@/lib/member-role-rules";
import { WorkspaceMembersView } from "./workspace-members-view";

const PAGE = { infinite: true, pageSize: 100, keepPreviousData: true } as const;

/**
 * #210 Settings → Members, live from Clerk: the people come from Clerk's organization memberships and the pending
 * invitations from Clerk's invitations (Admins only), read in the browser like Clerk's own members page. Every
 * change goes through Lane's server actions, which ask Clerk; the lists reload afterwards. Lane stores none of it.
 */
export function WorkspaceMembers({ orgId, selfId, canManage, roles }: { orgId: string; selfId: string; canManage: boolean; roles: WorkspacePermission[] }) {
  const { isLoaded, memberships, invitations } = useOrganization({
    memberships: PAGE,
    invitations: canManage ? { ...PAGE, status: ["pending"] } : undefined,
  });

  const people: WorkspaceMember[] = (memberships?.data ?? []).flatMap(membership => {
    const user = membership.publicUserData;
    if (!user?.userId) return [];
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.identifier || user.userId;
    return [{ userId: user.userId, name, email: user.identifier ?? "", role: clerkWorkspacePermission(membership.role), imageUrl: user.imageUrl }];
  });
  const pending: PendingInvitation[] = (invitations?.data ?? []).map(invitation => ({ id: invitation.id, email: invitation.emailAddress, role: clerkWorkspacePermission(invitation.role) }));

  const failed = Boolean(memberships?.error || (canManage && invitations?.error));
  const loading = !isLoaded || memberships?.isLoading || (canManage && invitations?.isLoading);
  const reload = useCallback(() => { void memberships?.revalidate?.(); void invitations?.revalidate?.(); }, [memberships, invitations]);
  // Clerk's lists page by 100; a larger workspace loads the rest as soon as the first page arrives.
  const more = Boolean(memberships?.hasNextPage && !memberships.isFetching);
  useEffect(() => { if (more) void memberships?.fetchNext?.(); }, [more, memberships]);

  const after = <T extends { success?: true; error?: string }>(answer: T) => { if (answer.success) reload(); return answer; };

  return <WorkspaceMembersView people={people} invitations={pending} selfId={selfId} canManage={canManage} roles={roles}
    state={failed ? "error" : loading ? "loading" : "ready"} onRetry={reload}
    onInvite={async (email, role) => after(await inviteToWorkspace({ email, role }, { orgId }))}
    onChangeRole={async (userId, role) => after(await changeMemberRole({ userId, role }, { orgId }))}
    onRevoke={async invitationId => after(await revokeInvitation({ invitationId }, { orgId }))} />;
}
