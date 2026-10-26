import { requestListHref, type RequestListContext } from "./request-workspace";

/**
 * #219: the little of saved views the navigation needs, kept apart from saved-view-rules.ts so every page's first
 * load carries only this. A saved view is a person's own name for a set of Requests list filters (status view and
 * Project today; later list filters join `SavedViewFilters`).
 */
export type SavedViewFilters = RequestListContext;
export type SavedView = { id: string; name: string; filters: SavedViewFilters };

/** The Requests list link that opens a view. */
export const savedViewHref = (filters: SavedViewFilters) => requestListHref(filters.status, filters.project);

/** The view the person opened, while it is still saved. */
export function openSavedView<T extends SavedView>(views: readonly T[], openId: string | undefined): T | null {
  return (openId && views.find(view => view.id === openId)) || null;
}

/** The view the navigation highlights: the open one, on the list and on Request pages. */
export function viewInNavigation(views: readonly SavedView[], openId: string | undefined, pathname: string): string | null {
  if (pathname !== "/" && !pathname.startsWith("/requests/")) return null;
  return openSavedView(views, openId)?.id ?? null;
}
