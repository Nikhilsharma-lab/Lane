import type { WorkspaceSearchInput, WorkspaceSearchResponse } from "@/lib/workspace-search";

const sessionExpired: WorkspaceSearchResponse = { success: false, error: { code: "session_expired", message: "Your workspace session changed. Refresh the page to search again." } };
const searchFailed: WorkspaceSearchResponse = { success: false, error: { code: "search_failed", message: "Search couldn't be completed. Try again." } };

/**
 * Plan item 1.16 (decision 8.15): search reads GET /api/search instead of a
 * server action, so typing never queues behind a pending mutation and a
 * stale request is aborted instead of finishing first. Status codes map to
 * the same response shape the action returned.
 */
export function fetchWorkspaceSearch(orgId: string) {
  return async (input: WorkspaceSearchInput, signal?: AbortSignal): Promise<WorkspaceSearchResponse> => {
    const params = new URLSearchParams({ org: orgId, q: input.query });
    if (input.requestsPage) params.set("requestsPage", String(input.requestsPage));
    if (input.projectsPage) params.set("projectsPage", String(input.projectsPage));
    if (input.statuses?.length) params.set("statuses", input.statuses.join(","));
    if (input.types?.length) params.set("types", input.types.join(","));
    if (input.sort) params.set("sort", input.sort);
    if (input.createdSince) params.set("createdSince", input.createdSince);
    if (input.createdBefore) params.set("createdBefore", input.createdBefore);
    const response = await fetch(`/api/search?${params}`, { signal, headers: { accept: "application/json" }, credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) return sessionExpired;
    const body = await response.json().catch(() => null) as WorkspaceSearchResponse | null;
    if (!body || typeof body !== "object" || !("success" in body)) return searchFailed;
    return body;
  };
}
