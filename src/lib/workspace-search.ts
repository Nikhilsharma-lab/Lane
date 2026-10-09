export const WORKSPACE_SEARCH_PAGE_SIZE = 20;
export const WORKSPACE_SEARCH_QUERY_MAX = 200;

export type WorkspaceSearchInput = {
  query: string;
  requestsPage?: number;
  projectsPage?: number;
};

export type WorkspaceSearchPage<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
  page: number;
};

export type WorkspaceSearchRequest = {
  id: string;
  /** Saved workspace-local number. Optional only for older illustrative fixtures. */
  requestNumber?: number;
  title: string;
  reframedProblem: string | null;
  status: "open" | "in_progress" | "done";
  projectId: string | null;
  projectName: string | null;
  requestType: "bug" | "improvement" | "new_feature" | null;
  createdAt: string;
};

export type WorkspaceSearchProject = {
  id: string;
  name: string;
  description: string | null;
};

export type WorkspaceSearchResponse = {
  success: true;
  query: string;
  requests: WorkspaceSearchPage<WorkspaceSearchRequest>;
  projects: WorkspaceSearchPage<WorkspaceSearchProject>;
} | {
  success: false;
  error: { code: "session_expired" | "validation" | "search_failed"; message: string };
};
