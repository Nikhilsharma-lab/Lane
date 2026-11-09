import type { RequestProjectFilter } from "@/lib/request-workspace"

/*
 * #240 decision 10 (A215): which filters the person added themselves. Its own small file because the list's view
 * state, which every signed-in page loads, reads it (list-view-model.ts); the list's empty lines stay in
 * list-empty-state.ts, with the list.
 */

/** The list's filters (list-view-model.ts listFiltersOf), and whether its Project was added from Add filter. */
export type FilterView = { project: RequestProjectFilter; title: string; requestType: string; projectAdded?: boolean }
export type AddedFilter = "title" | "project" | "requestType"

/**
 * The one rule for the filters the person added from the toolbar, in their chips' order: the title filter, a Project
 * added from Add filter (or the summary) on the whole list, and the label filter. Only these make a chip, the match
 * bar and the generic empty line, and only these does Clear all clear. A status pill shows itself in the pill row and
 * a Project page's Project is the page's title, so neither counts.
 */
export function addedFilters(view: FilterView): AddedFilter[] {
  return [
    ...view.title.trim() ? ["title" as const] : [],
    ...view.projectAdded && view.project !== "all" ? ["project" as const] : [],
    ...view.requestType ? ["requestType" as const] : [],
  ]
}
export const hasAddedFilters = (view: FilterView) => addedFilters(view).length > 0
