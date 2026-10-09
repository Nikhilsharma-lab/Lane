"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
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

export function WorkspaceProjectsProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceProjectsReducer, initialWorkspaceProjectsState);
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
    void reload();
    return () => { mounted.current = false; requestSequence.current += 1; };
  }, [reload]);

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
