import { requestLabelKeys } from "./request-labels"
import type { RequestPriority, RequestType } from "./request-properties"
import type { RequestProjectFilter, RequestStatusFilter } from "./request-workspace"

export type OverviewRequest = {
  agreementBlocked?: boolean
  /** Why it can't be picked up yet (measurementReadiness), from the loader. */
  pickupBlockedReason?: string | null
  /** Saved reviews: open concerns and the unanswered count (#77). Optional only for older fixtures. */
  reviewState?: import("@/lib/request-reviewer-rules").ReviewState | null
  id: string
  /** Saved workspace-local number. Optional only for older illustrative fixtures. */
  requestNumber?: number
  title: string
  reframedProblem: string | null
  status: "open" | "in_progress" | "done"
  createdAt: string
  canEdit?: boolean
  creatorName: string | null
  assigneeName: string | null
  assigneeAvatarUrl?: string | null
  assignedTo?: string | null
  projectId?: string | null
  projectName?: string | null
  labelKeys?: string[] | null
  requestType?: RequestType | null
  /** Saved triage signal. Optional only for older illustrative fixtures. */
  priority?: RequestPriority
}

export type RequestSort = "newest" | "oldest" | "title"
export type RequestOrdering = RequestSort | "title_desc" | "status"
export type RequestGrouping = "none" | "status" | "project" | "assignee"
export type RequestRowGroup = { key: string; label: string; rows: OverviewRequest[] }

const statusOrder = { open: 0, in_progress: 1, done: 2 }
const statusLabels = { open: "Open", in_progress: "In Progress", done: "Done" }
const compareText = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true })

/** Stable order keeps page boundaries predictable when names or dates match. */
export function sortRequestRows(rows: OverviewRequest[], order: RequestOrdering) {
  return [...rows].sort((a, b) => {
    let difference: number
    if (order === "status") difference = statusOrder[a.status] - statusOrder[b.status]
    else if (order === "title" || order === "title_desc") difference = compareText(a.reframedProblem ?? a.title, b.reframedProblem ?? b.title) * (order === "title_desc" ? -1 : 1)
    else difference = (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * (order === "oldest" ? -1 : 1)
    return difference || compareText(a.id, b.id)
  })
}

/** Group identity comes from IDs, never a person's or Project's display name. */
export function groupRequestRows(rows: OverviewRequest[], grouping: RequestGrouping): RequestRowGroup[] {
  if (grouping === "none") return [{ key: "all", label: "Requests", rows }]
  const groups = new Map<string, RequestRowGroup>()
  for (const row of rows) {
    const identity = grouping === "status" ? row.status : grouping === "project" ? row.projectId ?? "none" : row.assignedTo ?? "none"
    const key = `${grouping}:${identity}`
    const label = grouping === "status" ? statusLabels[row.status]
      : grouping === "project" ? row.projectId ? row.projectName ?? "Unavailable Project" : "No Project"
      : row.assignedTo ? row.assigneeName ?? "Unknown member" : "Unassigned"
    const group = groups.get(key) ?? { key, label, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => {
    if (grouping === "status") return statusOrder[a.rows[0].status] - statusOrder[b.rows[0].status]
    if (a.key === `${grouping}:none`) return 1
    if (b.key === `${grouping}:none`) return -1
    return compareText(a.label, b.label) || compareText(a.key, b.key)
  })
}

/** The list's filters as DataTable applies them: the status view, the Project
 * ("all", "none" or an id), the in-list title text and the Request type ("" for any). */
export type ListFilters = { status: RequestStatusFilter; project: RequestProjectFilter; title: string; requestType: string }
export type ListFilterKey = keyof ListFilters

/** Which of the list's filters leave this row out. Collapsed groups and later
 * pages are not filters. One function for the list and the composer's
 * hidden-by-filters toast (plan item 2.3), so they cannot disagree. */
export function filtersHiding(row: OverviewRequest, filters: ListFilters): ListFilterKey[] {
  const hiding: ListFilterKey[] = []
  if (filters.status !== "all" && row.status !== filters.status) hiding.push("status")
  if (filters.project && filters.project !== "all" && (row.projectId ?? "none") !== filters.project) hiding.push("project")
  const query = filters.title.trim().toLocaleLowerCase()
  if (query && !(row.reframedProblem ?? row.title).toLocaleLowerCase().includes(query)) hiding.push("title")
  if (filters.requestType && !(filters.requestType === "none" ? requestLabelKeys(row).length === 0 : requestLabelKeys(row).includes(filters.requestType))) hiding.push("requestType")
  return hiding
}

export function matchesListFilters(row: OverviewRequest, filters: ListFilters) {
  return filtersHiding(row, filters).length === 0
}

export function paginateRequests<T>(items: T[], requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const pageIndex = Math.max(0, Math.min(requestedPage, pageCount - 1))
  return { rows: items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), pageIndex, pageCount }
}
