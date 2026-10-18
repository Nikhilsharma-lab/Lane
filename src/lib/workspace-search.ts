export const WORKSPACE_SEARCH_PAGE_SIZE = 20;
export const WORKSPACE_SEARCH_QUERY_MAX = 200;

export type SearchStatus = "open" | "in_progress" | "done";
export type SearchRequestType = "bug" | "improvement" | "new_feature" | "none";
export type SearchSort = "relevance" | "newest" | "title";
export type WorkspaceSearchFilters = {
  statuses?: SearchStatus[];
  types?: SearchRequestType[];
  createdFrom?: string;
  createdTo?: string;
};

export type WorkspaceSearchInput = WorkspaceSearchFilters & {
  query: string;
  requestsPage?: number;
  projectsPage?: number;
  sort?: SearchSort;
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
  description?: string;
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
  createdAt?: string;
};

export type WorkspaceSearchResponse = {
  success: true;
  query: string;
  requests: WorkspaceSearchPage<WorkspaceSearchRequest>;
  projects: WorkspaceSearchPage<WorkspaceSearchProject>;
  facets?: { statuses: Partial<Record<SearchStatus, number>>; types: Partial<Record<SearchRequestType, number>> };
} | {
  success: false;
  error: { code: "session_expired" | "validation" | "search_failed"; message: string };
};
