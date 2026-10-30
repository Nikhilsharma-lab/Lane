"use client";

import { callAction } from "@/lib/action-call";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { listProjects } from "@/app/(app)/intake/project-actions";
import type { ProjectOption } from "@/lib/request-constants";
import { createWorkspaceCatalogue, useWorkspaceCatalogue } from "@/lib/workspace-catalogue";

type SharedWorkspaceProjects = {
  orgId: string; projects: ProjectOption[]; loading: boolean; error: string | null;
  reload: () => Promise<void>; addProject: (project: ProjectOption) => void;
};
const WorkspaceProjectsContext = createContext<SharedWorkspaceProjects | null>(null);

/** The production adapter retains Project ordering and explicit action recovery. */
export function createWorkspaceProjects(orgId: string, initialProjects: ProjectOption[]) {
  return createWorkspaceCatalogue({
    initial: { entries: initialProjects, metadata: null },
    loadError: "Projects could not be loaded. Try again.",
    clearErrorOnChange: true,
    arrange: entries => entries.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    read: async () => {
      const result = await callAction(() => listProjects({ orgId }));
      return result.success ? { success: true, entries: result.projects, metadata: null } : { success: false, error: result.error.message };
    },
  });
}

type ProviderProps = { orgId: string; initialProjects: ProjectOption[]; children?: ReactNode };
/** A workspace switch replaces the owner before any child can read the old catalogue. */
export function WorkspaceProjectsProvider(props: ProviderProps) {
  return <WorkspaceProjectsCatalogue key={props.orgId} {...props} />;
}
function WorkspaceProjectsCatalogue({ orgId, initialProjects, children }: ProviderProps) {
  // Layout seeds once. Same-workspace refresh props do not replace local state.
  const state = useWorkspaceCatalogue(() => createWorkspaceProjects(orgId, initialProjects));
  const value = useMemo(() => ({ orgId, projects: state.entries, loading: state.loading, error: state.error, reload: state.reload, addProject: state.add }), [orgId, state]);
  return <WorkspaceProjectsContext.Provider value={value}>{children}</WorkspaceProjectsContext.Provider>;
}

/** The workspace's Projects. The (app) layout always provides them. */
export function useSharedWorkspaceProjects(): SharedWorkspaceProjects {
  const projects = useContext(WorkspaceProjectsContext);
  if (!projects) throw new Error("useSharedWorkspaceProjects needs WorkspaceProjectsProvider (the (app) layout).");
  return projects;
}
