import { isRequestStatusFilter, REQUEST_TITLE_FILTER_MAX, type RequestListContext } from "./request-workspace";
import type { SavedView, SavedViewFilters } from "./saved-view-nav";

/**
 * #219: saved views, client-safe rules. Opening a view applies its filters through the normal list, so it never
 * shows more than the person may see. The navigation's part lives in saved-view-nav.ts.
 */
export { openSavedView, savedViewHref, viewInNavigation, type SavedView, type SavedViewFilters } from "./saved-view-nav";

export const SAVED_VIEW_NAME_MAX = 60;
export { REQUEST_TITLE_FILTER_MAX };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isProjectFilter = (value: unknown): value is string =>
  value === "all" || value === "none" || (typeof value === "string" && UUID.test(value));

type FilterInput = { status?: unknown; project?: unknown; title?: unknown };
const isTitleFilter = (value: unknown): value is string | undefined | null =>
  value === undefined || value === null || (typeof value === "string" && value.trim().length <= REQUEST_TITLE_FILTER_MAX);
/** A214: a title is kept trimmed, and only when there is one, so views without a title keep their old shape. */
const withTitle = (filters: SavedViewFilters, title: string | undefined | null): SavedViewFilters =>
  title?.trim() ? { ...filters, title: title.trim() } : filters;

/** The filters to save from the list, or null when they aren't filters the list has. */
export function savedViewFilters(input: FilterInput): SavedViewFilters | null {
  const { status, project, title } = input ?? {};
  if (typeof status !== "string" || !isRequestStatusFilter(status) || !isProjectFilter(project) || !isTitleFilter(title)) return null;
  return withTitle({ status, project: project.toLowerCase() }, title);
}

/**
 * Saved filters as the list reads them. Anything unknown reads as every Request, never as an empty list. A damaged
 * title is dropped without losing the view's status and Project; views saved before A214 have no title.
 */
export function readSavedViewFilters(stored: unknown): SavedViewFilters {
  const value = stored && typeof stored === "object" ? stored as FilterInput : {};
  const filters = savedViewFilters({ status: value.status, project: value.project }) ?? { status: "all", project: "all" };
  return isTitleFilter(value.title) ? withTitle(filters, value.title) : filters;
}

export function parseSavedViewName(input: unknown): { name: string } | { error: string } {
  const name = typeof input === "string" ? input.trim() : "";
  if (!name) return { error: "Give the view a name." };
  if (name.length > SAVED_VIEW_NAME_MAX) return { error: `Keep the name to ${SAVED_VIEW_NAME_MAX} characters or fewer.` };
  return { name };
}

/** Whether the list now shows other filters than the view saved. */
export const savedViewChanged = (saved: SavedViewFilters, current: RequestListContext) =>
  saved.status !== current.status || saved.project !== current.project || (saved.title ?? "").trim() !== (current.title ?? "").trim();

export type SavedViewChoice = "save" | "update" | "save_as_new" | "rename" | "delete";

/** What the list offers: save the list as a view, or, with a view open, save changed filters into it, save as new, rename or delete. */
export function savedViewChoices(open: SavedView | null, current: RequestListContext): SavedViewChoice[] {
  if (!open) return ["save"];
  return [...(savedViewChanged(open.filters, current) ? ["update" as const] : []), "save_as_new", "rename", "delete"];
}
