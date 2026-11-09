import { groupRequestRows, matchesListFilters, sortRequestRows, type FinishedCounts, type ListFilters, type OverviewRequest, type RequestRowGroup } from "@/lib/request-overview"
import { finishedViewOf, SHOWN_STEP, type FinishedView } from "@/lib/request-workspace"
import { hasAddedFilters } from "./added-filters"
import type { ListViewState } from "./list-view-state"

/** The list's filters as the view holds them: status, Project and title (the list context, A214), plus the label
 * filter, and whether the Project was added from Add filter (added-filters.ts). */
export function listFiltersOf(view: Pick<ListViewState, "status" | "project" | "title" | "localFilters" | "projectAdded">): ListFilters & Pick<ListViewState, "projectAdded"> {
  const local = (id: string) => String(view.localFilters.find(item => item.id === id)?.value ?? "")
  return { status: view.status, project: view.project, title: view.title, requestType: local("requestType"), projectAdded: view.projectAdded }
}

/** The finished statuses whose full counts the list read returns (requests.ts), by their status group's key. */
const FINISHED_GROUPS: Partial<Record<string, keyof FinishedCounts>> = { "status:done": "done", "status:measuring": "measuring", "status:closed": "closed" }

/** What the server says about the finished Requests it has not sent: each finished status's full count, and which older-finished reads have more. */
export type ListServerFacts = { finishedCounts?: FinishedCounts; olderMore?: Partial<Record<FinishedView, boolean>> }

/**
 * One group as the list shows it: all its loaded matching rows, the first of them it shows, its full count (the
 * server's for a finished status the filters don't narrow, else what is loaded), whether Show more has anything to
 * add, and the older-finished read Show more calls once the loaded rows run out (null when there is none).
 */
export type ListGroup = RequestRowGroup & { shown: OverviewRequest[]; count: number; more: boolean; older: FinishedView | null }
export type ListModel = { filters: ListFilters; groups: ListGroup[]; matching: OverviewRequest[]; visibleRows: OverviewRequest[] }

export { SHOWN_STEP }

/**
 * What the list shows for a view and its rows (the overlay already applied): the matching rows sorted and grouped,
 * each group's shown rows, full count and Show more (A212), and the rows a person can see (the shown rows of open
 * groups). The list, its keyboard grid, its selection and its preview all read this. Empty groups are always left
 * out (A221); a finished status with Requests only on the server is not empty. The same shape serves Status,
 * Project and Assignee grouping; no grouping is one group, "all".
 */
export function listViewModel(view: ListViewState, rows: OverviewRequest[], server: ListServerFacts = {}): ListModel {
  const filters = listFiltersOf(view)
  const grouped = groupRequestRows(sortRequestRows(rows.filter(row => matchesListFilters(row, filters)), view.ordering), view.grouping)
  // Only the status view narrows the server's counts; a Project page or an added filter leaves the loaded rows to count.
  const countsApply = filters.project === "all" && !hasAddedFilters(filters)
  const groups = grouped.map((group): ListGroup => {
    const finished = view.grouping === "status" ? FINISHED_GROUPS[group.key] : undefined
    const known = finished && countsApply && server.finishedCounts && (filters.status === "all" || filters.status === finished) ? server.finishedCounts[finished] : undefined
    const count = Math.max(known ?? 0, group.rows.length)
    // The older-finished read this group continues: its own status, or the status view it is part of. Finished
    // Requests were all picked up, so Unassigned never gains one.
    const read = view.grouping !== "status" ? group.key === "assignee:none" ? null : finishedViewOf(filters.status) : finished ? filters.status === "due" ? "due" : finished : null
    const older = read && server.olderMore?.[read] && (known === undefined || group.rows.length < known) ? read : null
    const shown = group.rows.slice(0, view.shownCounts[group.key] ?? SHOWN_STEP)
    return { ...group, shown, count, older, more: shown.length < group.rows.length || older !== null }
  }).filter(group => group.count > 0)
  const matching = groups.flatMap(group => group.rows)
  const visibleRows = groups.filter(group => view.grouping === "none" || !view.collapsedGroups.includes(group.key)).flatMap(group => group.shown)
  return { filters, groups, matching, visibleRows }
}

/**
 * A212: Show more under a group. It shows 25 more of that group's loaded rows, and once they run out, names the
 * older-finished read to call (the read's rows then fill the shown count). Other groups never move. A count the
 * address asked for that the rows have not reached yet (a reload) is never lowered: Show more then only reads.
 */
export function showMore(view: ListViewState, group: ListGroup): { view: ListViewState; read: FinishedView | null } {
  const next = Math.max(view.shownCounts[group.key] ?? SHOWN_STEP, group.shown.length + SHOWN_STEP)
  return { view: { ...view, shownCounts: { ...view.shownCounts, [group.key]: next } }, read: next > group.rows.length ? group.older : null }
}

/**
 * The smallest change that shows a Request already in the list (a return from its page, a reveal): its group's
 * shown count grows in steps of 25 until the row is in it, and a folded group unfolds. The same view comes back when
 * the row already shows or is not in the list, so a caller waiting on focus is not restarted.
 */
export function withRowShown(view: ListViewState, groups: ListGroup[], id: string): ListViewState {
  const group = groups.find(item => item.rows.some(row => row.id === id))
  if (!group) return view
  const index = group.rows.findIndex(row => row.id === id)
  const folded = view.grouping !== "none" && view.collapsedGroups.includes(group.key)
  const shown = index < group.shown.length ? group.shown.length : Math.ceil((index + 1) / SHOWN_STEP) * SHOWN_STEP
  if (!folded && shown === group.shown.length) return view
  return { ...view,
    collapsedGroups: folded ? view.collapsedGroups.filter(key => key !== group.key) : view.collapsedGroups,
    shownCounts: shown === group.shown.length ? view.shownCounts : { ...view.shownCounts, [group.key]: shown },
  }
}

/**
 * What each kind of view change resets, said once. Each key changes exactly
 * when its reset should happen; column visibility and a reveal never reset
 * anything.
 */
export const viewResets = {
  /** The selection drops when what the list shows, or how, changes, or the workspace or role does. Show more only adds rows, so it keeps it. */
  selection: (view: ListViewState, scope: { orgId?: string; isGuest: boolean; readOnly?: boolean }) =>
    JSON.stringify([scope.orgId, scope.isGuest, scope.readOnly ?? false, view.status, view.project, view.title, view.localFilters, view.ordering, view.grouping, view.collapsedGroups]),
  /** The preview closes when a filter, order, grouping or shown-count change leaves its Request out of the shown rows. */
  preview: (view: ListViewState) =>
    JSON.stringify([view.status, view.project, view.title, view.localFilters, view.ordering, view.grouping, view.shownCounts]),
  /** The match count is announced after a filter change, not after a data change. */
  announcement: (view: ListViewState) => {
    const { status, project, title, requestType } = listFiltersOf(view)
    return JSON.stringify([status, project, title, requestType])
  },
}
