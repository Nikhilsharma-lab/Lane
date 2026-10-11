"use client";

import { useClerk, useOrganization } from "@clerk/nextjs";
import { useMemo } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { parseRequestStatusFilter, parseRequestProjectFilter, requestListHref } from "@/lib/request-workspace";
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
import { createProject } from "@/app/(app)/intake/project-actions";
import { NotificationBell } from "./notification-bell";
import { SidebarView } from "./sidebar-view";
import { fetchWorkspaceSearch } from "./workspace-search-pane";
import { useWorkspaceSwitcher } from "./use-workspace-switcher";

export function Sidebar({
  children,
  workspaceName,
  fullName,
  email,
  role,
  orgId,
  unreadCount,
}: {
  children?: React.ReactNode;
  workspaceName: string;
  fullName: string;
  email: string;
  role: string;
  orgId: string;
  /** The (app) layout's unread count, streamed to the bell (plan item 1.8). */
  unreadCount?: Promise<number>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectState = useSharedWorkspaceProjects();
  const { isLoaded, organization } = useOrganization();
  const { signOut } = useClerk();
  const workspaceSwitcher = useWorkspaceSwitcher(orgId);
  // Plan item 1.16: search reads the GET route, so it never queues behind a mutation.
  const search = useMemo(() => fetchWorkspaceSearch(orgId), [orgId]);
  // Clerk owns the current name. Only a matching loaded organization may
  // replace the server fallback; a display update never selects a workspace.
  const displayedWorkspaceName =
    isLoaded && organization?.id === orgId && organization.name.trim()
      ? organization.name
      : workspaceName;

  return (
    <SidebarView
      previewProjectTree
      linearPreviewAutoCollapse
      workspaceName={displayedWorkspaceName}
      fullName={fullName}
      email={email}
      role={role}
      pathname={pathname}
      statusFilter={parseRequestStatusFilter(searchParams.get("status") ?? undefined)}
      projectFilter={parseRequestProjectFilter(searchParams.get("project") ?? undefined)}
      projects={projectState?.orgId === orgId ? projectState.projects : []}
      projectsLoading={projectState?.loading}
      projectsError={projectState?.error}
      onRetryProjects={() => projectState?.reload()}
      onCreateProject={async name => {
        const result = await createProject({ name }, { orgId });
        if (!result.success) throw new Error(result.error.message);
        projectState?.addProject(result.project);
        router.push(requestListHref("all", result.project.id));
        return result.project;
      }}
      notifications={<NotificationBell orgId={orgId} unreadCount={unreadCount} />}
      onSignOut={() => signOut({ redirectUrl: "/login" })}
      onSearch={search}
      workspaceSwitcher={workspaceSwitcher}
    >
      {children}
    </SidebarView>
  );
}
