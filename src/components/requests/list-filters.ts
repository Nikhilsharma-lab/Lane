"use client"

import { useRequestListContext, useRequestListView, withListContext, type ListViewState, type OpenListContext } from "./list-view-state"

/*
 * A214: the Requests list's own filter changes and the saved-view filters it compares, kept apart from
 * list-view-state.tsx, which every signed-in page loads, so only the list's page carries them.
 */

/** The list context with (A214) its title filter, for what saves or compares a saved view. Re-renders on any change to the list's view. */
export function useRequestListFilters(): OpenListContext & { title: string } {
  return { ...useRequestListContext(), title: useRequestListView()[0].title }
}

/**
 * One list filter changed from the toolbar or the summary: the Project and (A214) the title are list context, so the
 * address and saved views keep them; the label filter stays in the view. Either way each group goes back to its first 25.
 */
export function withListFilter(view: ListViewState, id: string, value: string): ListViewState {
  if (id === "project") return withListContext(view, { project: value || "all" })
  if (id === "title") return withListContext(view, { title: value })
  return { ...view, shownCounts: {}, localFilters: [...view.localFilters.filter(item => item.id !== id), ...(value ? [{ id, value }] : [])] }
}

/** Clear filters: every status, every Project, no title and no label filter, each group at its first 25. */
export function withoutListFilters(view: ListViewState): ListViewState {
  return { ...withListContext(view, { status: "all", project: "all", title: "" }), localFilters: [], shownCounts: {} }
}
