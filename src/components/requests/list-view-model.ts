import { groupRequestRows, matchesListFilters, paginateRequests, sortRequestRows, type ListFilters, type OverviewRequest } from "@/lib/request-overview"
import type { ListViewState } from "./list-view-state"

/** The list's filters as the view holds them: status and Project, plus the title and label filters. */
export function listFiltersOf(view: Pick<ListViewState, "status" | "project" | "localFilters">): ListFilters {
  const local = (id: string) => String(view.localFilters.find(item => item.id === id)?.value ?? "")
  return { status: view.status, project: view.project, title: local("title"), requestType: local("requestType") }
}

/**
 * What the list shows for a view and its rows (the overlay already applied):
 * the matching rows sorted and grouped, the current page, and the rows a
 * person can see on it (collapsed groups left out). The list, its keyboard
 * grid and its selection all read this. Grouped by status with every status
 * shown, the board keeps a column for each journey status, empty ones
 * included; a status view keeps only the columns with Requests in it.
 */
export function listViewModel(view: ListViewState, rows: OverviewRequest[]) {
  const filters = listFiltersOf(view)
  const grouped = groupRequestRows(sortRequestRows(rows.filter(row => matchesListFilters(row, filters)), view.ordering), view.grouping)
  const groups = view.status === "all" ? grouped : grouped.filter(group => group.rows.length)
  const matching = groups.flatMap(group => group.rows)
  const page = paginateRequests(matching, view.pagination.pageIndex, view.pagination.pageSize)
  const onPage = new Set(page.rows.map(row => row.id))
  const visibleRows = view.grouping === "none"
    ? page.rows
    : groups.filter(group => !view.collapsedGroups.includes(group.key)).flatMap(group => group.rows.filter(row => onPage.has(row.id)))
  return { filters, groups, matching, page, onPage, visibleRows }
}

/**
 * What each kind of view change resets, said once. Each key changes exactly
 * when its reset should happen; column visibility and a reveal never reset
 * anything.
 */
export const viewResets = {
  /** The selection drops when what the list shows, or how, changes, or the workspace or role does. */
  selection: (view: ListViewState, scope: { orgId?: string; isGuest: boolean; readOnly?: boolean }) =>
    JSON.stringify([scope.orgId, scope.isGuest, scope.readOnly ?? false, view.status, view.project, view.localFilters, view.ordering, view.grouping, view.collapsedGroups, view.pagination]),
  /** The preview closes when a filter, order, grouping or page change leaves its Request off the page. */
  preview: (view: ListViewState) =>
    JSON.stringify([view.status, view.project, view.localFilters, view.ordering, view.grouping, view.pagination]),
  /** The match count is announced after a filter change, not after a data change. */
  announcement: (view: ListViewState) => {
    const { status, project, title, requestType } = listFiltersOf(view)
    return JSON.stringify([status, project, title, requestType])
  },
}
