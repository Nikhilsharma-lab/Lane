"use client";

import { callAction } from "@/lib/action-call";
import { useClerk, useOrganization } from "@clerk/nextjs";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { requestListHref } from "@/lib/request-workspace";
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
import { createProject } from "@/app/(app)/intake/project-actions";
import { InboxBell } from "./inbox-bell";
import { SidebarView } from "./sidebar-view";
import { CommandPaletteHost } from "./command-palette-lazy";
import type { PaletteRole } from "./command-palette-entries";
import { fetchWorkspaceSearch } from "./workspace-search-fetch";
import { useWorkspaceSwitcher } from "./use-workspace-switcher";

export function Sidebar({
  children,
  workspaceName,
  fullName,
  email,
  role,
  orgId,
  userId,
  unreadCount,
}: {
  children?: React.ReactNode;
  workspaceName: string;
  fullName: string;
  email: string;
  role: PaletteRole;
  orgId: string;
  /** The signed-in user: a Pick up from the palette on Request detail names them as Assignee (#106). */
  userId: string;
  /** The (app) layout's unread count, streamed to the bell (plan item 1.8). */
  unreadCount?: Promise<number>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const projectState = useSharedWorkspaceProjects();
  const { isLoaded, organization } = useOrganization();
  const { signOut } = useClerk();
  const workspaceSwitcher = useWorkspaceSwitcher(orgId);
  // Plan item 1.16: search reads the GET route, so it never queues behind a mutation.
  const search = useMemo(() => fetchWorkspaceSearch(orgId), [orgId]);
  // Clerk owns the current name. Only a matching loaded organization may
  // replace the server fallback; a display update never selects a workspace.
  const projects = projectState.projects;
  const viewer = useMemo(() => ({ id: userId, name: fullName }), [userId, fullName]);
  const displayedWorkspaceName =
    isLoaded && organization?.id === orgId && organization.name.trim()
      ? organization.name
      : workspaceName;

  return (
    <SidebarView
      workspaceName={displayedWorkspaceName}
      fullName={fullName}
      email={email}
      role={role}
      pathname={pathname}
      projects={projectState.projects}
      projectsLoading={projectState.loading}
      projectsError={projectState.error}
      onRetryProjects={() => projectState.reload()}
      onCreateProject={async name => {
        const result = await callAction(() => createProject({ name }, { orgId }));
        if (!result.success) throw new Error(result.error.message);
        projectState.addProject(result.project);
        router.push(requestListHref("all", result.project.id));
        return result.project;
      }}
      notifications={<InboxBell orgId={orgId} unreadCount={unreadCount} current={pathname === "/inbox"} />}
      palette={<CommandPaletteHost orgId={orgId} role={role} viewer={viewer} projects={projects} pathname={pathname} />}
      onSignOut={() => signOut({ redirectUrl: "/login" })}
      onSearch={search}
      workspaceSwitcher={workspaceSwitcher}
    >
      {children}
    </SidebarView>
  );
}
