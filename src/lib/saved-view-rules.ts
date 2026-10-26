import { isRequestStatusFilter, requestListHref, type RequestListContext } from "./request-workspace";

/**
 * #219: saved views, client-safe rules. A saved view is a person's own name for a set of Requests list filters
 * (status view and Project today; later list filters join `SavedViewFilters`). Opening one applies the filters
 * through the normal list, so it never shows more than the person may see.
 */
export type SavedViewFilters = RequestListContext;
export type SavedView = { id: string; name: string; filters: SavedViewFilters };

export const SAVED_VIEW_NAME_MAX = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isProjectFilter = (value: unknown): value is string =>
  value === "all" || value === "none" || (typeof value === "string" && UUID.test(value));

/** The filters to save from the list, or null when they aren't filters the list has. */
export function savedViewFilters(input: { status?: unknown; project?: unknown }): SavedViewFilters | null {
  const { status, project } = input ?? {};
  if (typeof status !== "string" || !isRequestStatusFilter(status) || !isProjectFilter(project)) return null;
  return { status, project: project.toLowerCase() };
}

/** Saved filters as the list reads them. Anything unknown reads as every Request, never as an empty list. */
export function readSavedViewFilters(stored: unknown): SavedViewFilters {
  const value = stored && typeof stored === "object" ? stored as { status?: unknown; project?: unknown } : {};
  return savedViewFilters(value) ?? { status: "all", project: "all" };
}

export function parseSavedViewName(input: unknown): { name: string } | { error: string } {
  const name = typeof input === "string" ? input.trim() : "";
  if (!name) return { error: "Give the view a name." };
  if (name.length > SAVED_VIEW_NAME_MAX) return { error: `Keep the name to ${SAVED_VIEW_NAME_MAX} characters or fewer.` };
  return { name };
}

/** The Requests list link that opens a view. */
export const savedViewHref = (filters: SavedViewFilters) => requestListHref(filters.status, filters.project);

/** Whether the list now shows other filters than the view saved. */
export const savedViewChanged = (saved: SavedViewFilters, current: RequestListContext) =>
  saved.status !== current.status || saved.project !== current.project;

/** The view the person opened, while it is still saved. */
export function openSavedView<T extends SavedView>(views: readonly T[], openId: string | undefined): T | null {
  return (openId && views.find(view => view.id === openId)) || null;
}

/** The view the navigation highlights: the open one, on the list and on Request pages. */
export function viewInNavigation(views: readonly SavedView[], openId: string | undefined, pathname: string): string | null {
  if (pathname !== "/" && !pathname.startsWith("/requests/")) return null;
  return openSavedView(views, openId)?.id ?? null;
}
