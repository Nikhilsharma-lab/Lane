"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { listProjects } from "@/app/(app)/intake/project-actions";
import type { ProjectOption } from "@/lib/request-properties";

type WorkspaceProjectsState = {
  projects: ProjectOption[];
  addedProjects: ProjectOption[];
  loading: boolean;
  error: string | null;
  requestId: number;
};

type WorkspaceProjectsAction =
  | { type: "load-started"; requestId: number }
  | { type: "load-succeeded"; requestId: number; projects: ProjectOption[] }
  | { type: "load-failed"; requestId: number; error: string }
  | { type: "project-added"; project: ProjectOption };

export const initialWorkspaceProjectsState: WorkspaceProjectsState = {
  projects: [], addedProjects: [], loading: true, error: null, requestId: 0,
};

function mergeProjects(base: ProjectOption[], additions: ProjectOption[]): ProjectOption[] {
  const byId = new Map(base.map((project) => [project.id, project]));
  for (const project of additions) byId.set(project.id, project);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function workspaceProjectsReducer(
  state: WorkspaceProjectsState,
  action: WorkspaceProjectsAction,
): WorkspaceProjectsState {
  switch (action.type) {
    case "load-started":
      return { ...state, requestId: action.requestId, loading: true, error: null };
    case "load-succeeded":
      if (action.requestId !== state.requestId) return state;
      return { ...state, projects: mergeProjects(action.projects, state.addedProjects), loading: false, error: null };
    case "load-failed":
      if (action.requestId !== state.requestId) return state;
      return { ...state, loading: false, error: action.error };
    case "project-added":
      return {
        ...state,
        projects: mergeProjects(state.projects, [action.project]),
        addedProjects: mergeProjects(state.addedProjects, [action.project]),
        error: null,
      };
  }
}

type SharedWorkspaceProjects = {
  orgId: string;
  projects: ProjectOption[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addProject: (project: ProjectOption) => void;
};

const WorkspaceProjectsContext = createContext<SharedWorkspaceProjects | null>(null);

/** Seeds the provider from the (app) layout's loadProjects read; without it the provider fetches on mount. */
export function seedWorkspaceProjectsState(initialProjects?: ProjectOption[]): WorkspaceProjectsState {
  if (!initialProjects) return initialWorkspaceProjectsState;
  return { ...initialWorkspaceProjectsState, projects: initialProjects, loading: false };
}

export function WorkspaceProjectsProvider({ orgId, initialProjects, children }: { orgId: string; initialProjects?: ProjectOption[]; children: ReactNode }) {
  // Plan item 1.8: the layout passes the Projects it already read, so the
  // sidebar paints with them and no listProjects action runs on load. The
  // action still serves the client refresh (retry, duplicate-name resolution).
  const [state, dispatch] = useReducer(workspaceProjectsReducer, initialProjects, seedWorkspaceProjectsState);
  const [seeded] = useState(initialProjects !== undefined);
  const mounted = useRef(false);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestSequence.current;
    dispatch({ type: "load-started", requestId });
    try {
      const result = await listProjects({ orgId });
      if (!mounted.current) return;
      if (result.success) dispatch({ type: "load-succeeded", requestId, projects: result.projects });
      else dispatch({ type: "load-failed", requestId, error: result.error.message });
    } catch {
      if (mounted.current) dispatch({ type: "load-failed", requestId, error: "Projects could not be loaded. Try again." });
    }
  }, [orgId]);

  useEffect(() => {
    mounted.current = true;
    if (!seeded) void reload();
    return () => { mounted.current = false; requestSequence.current += 1; };
  }, [reload, seeded]);

  const addProject = useCallback((project: ProjectOption) => {
    dispatch({ type: "project-added", project });
  }, []);
  const value = useMemo(() => ({
    orgId, projects: state.projects, loading: state.loading, error: state.error, reload, addProject,
  }), [orgId, state.projects, state.loading, state.error, reload, addProject]);

  return <WorkspaceProjectsContext.Provider value={value}>{children}</WorkspaceProjectsContext.Provider>;
}

export function useSharedWorkspaceProjects(): SharedWorkspaceProjects | null {
  return useContext(WorkspaceProjectsContext);
}
