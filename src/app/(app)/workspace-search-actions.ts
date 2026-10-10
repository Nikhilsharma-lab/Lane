"use server";

import { requireActiveMember } from "@/lib/auth-guard";
import { loadWorkspaceSearch, workspaceSearchInputSchema } from "@/lib/data/search";
import type { WorkspaceSearchInput, WorkspaceSearchResponse } from "@/lib/workspace-search";

/**
 * Kept for callers that still go through a server action. The sidebar's
 * search pane reads /api/search instead (plan item 1.16), so typing never
 * queues behind a pending mutation. The SQL lives in src/lib/data/search.ts.
 */
export async function searchWorkspace(
  input: WorkspaceSearchInput,
  context: { orgId: string },
): Promise<WorkspaceSearchResponse> {
  const auth = typeof context?.orgId === "string" ? await requireActiveMember(context.orgId) : null;
  if (!auth) return { success: false, error: { code: "session_expired", message: "Your workspace session changed. Refresh the page to search again." } };

  const parsed = workspaceSearchInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: { code: "validation", message: "Use a search of 200 characters or fewer and a valid results page." } };

  try {
    return await loadWorkspaceSearch(auth, parsed.data);
  } catch {
    // Database errors may include bound search text; do not log them or return
    // partial results as if both categories loaded successfully.
    return { success: false, error: { code: "search_failed", message: "Search could not be completed. Try again." } };
  }
}
