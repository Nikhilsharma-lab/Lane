import type { WorkspacePermission } from "./auth-guard"

/** The two access rules for a Request already loaded from the viewer's
 * workspace, safe in the browser. request-access.ts states them for queries. */
type Viewer = { userId: string; role: WorkspacePermission }

/** A guest sees only the Requests they created; everyone else sees all of the workspace's. */
export function canSee(viewer: Viewer, request: { createdBy: string }): boolean {
  return viewer.role !== "guest" || request.createdBy === viewer.userId
}

/** Its creator (a guest included) or an admin changes a Request. */
export function canChange(viewer: Viewer, request: { createdBy: string }): boolean {
  return viewer.role === "admin" || request.createdBy === viewer.userId
}
