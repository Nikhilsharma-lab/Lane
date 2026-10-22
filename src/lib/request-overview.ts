import { requestLabelKeys } from "./request-labels"
import { JOURNEY_STATUSES, dueSignal, journeyStatus, type DueSignal, type Journey, type JourneyFacts } from "./request-journey"
import type { ReleaseState } from "./request-release"
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
  /** The journey facts (#133): the release record and the closures. Absent means none saved. */
  releaseState?: ReleaseState | null
  outcomeClosure?: unknown
  exceptionClosure?: unknown
}

const journeyFacts = (row: OverviewRequest): JourneyFacts => ({ status: row.status, releaseState: row.releaseState ?? null, outcomeClosure: row.outcomeClosure ?? null, exceptionClosure: row.exceptionClosure ?? null })

/** A row's one status, read through the journey module: Open, In progress, Done, Measuring or Closed. */
export function rowJourney(row: OverviewRequest): Journey {
  return journeyStatus(journeyFacts(row))
}

/** A row's due tag on `now`'s UTC date: "Due in N days", "Due today", "Overdue N days" or none. */
export function rowDue(row: OverviewRequest, now: Date): DueSignal {
  return dueSignal(journeyFacts(row), now)
}

export type RequestSort = "newest" | "oldest" | "title"
export type RequestOrdering = RequestSort | "title_desc" | "status"
export type RequestGrouping = "none" | "status" | "project" | "assignee"
export type RequestRowGroup = { key: string; label: string; rows: OverviewRequest[] }

/** Journey order: a row's place along Open → In progress → Done → Measuring → Closed. */
const journeyOrder = (row: OverviewRequest) => JOURNEY_STATUSES.findIndex(step => step.status === rowJourney(row).status)
const compareText = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true })

/** Stable order keeps page boundaries predictable when names or dates match. */
export function sortRequestRows(rows: OverviewRequest[], order: RequestOrdering) {
  return [...rows].sort((a, b) => {
    let difference: number
    if (order === "status") difference = journeyOrder(a) - journeyOrder(b)
    else if (order === "title" || order === "title_desc") difference = compareText(a.reframedProblem ?? a.title, b.reframedProblem ?? b.title) * (order === "title_desc" ? -1 : 1)
    else difference = (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * (order === "oldest" ? -1 : 1)
    return difference || compareText(a.id, b.id)
  })
}

/** Group identity comes from IDs, never a person's or Project's display name.
 * Grouped by status, the list is the board: one column per journey status (#133). */
export function groupRequestRows(rows: OverviewRequest[], grouping: RequestGrouping): RequestRowGroup[] {
  if (grouping === "none") return [{ key: "all", label: "Requests", rows }]
  const groups = new Map<string, RequestRowGroup>()
  for (const row of rows) {
    const step = grouping === "status" ? JOURNEY_STATUSES[journeyOrder(row)] : null
    const identity = step ? step.status : grouping === "project" ? row.projectId ?? "none" : row.assignedTo ?? "none"
    const key = `${grouping}:${identity}`
    const label = step ? step.label
      : grouping === "project" ? row.projectId ? row.projectName ?? "Unavailable Project" : "No Project"
      : row.assignedTo ? row.assigneeName ?? "Unknown member" : "Unassigned"
    const group = groups.get(key) ?? { key, label, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => {
    if (grouping === "status") return journeyOrder(a.rows[0]) - journeyOrder(b.rows[0])
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
 * hidden-by-filters toast (plan item 2.3), so they cannot disagree.
 * The status view reads the journey module, as its database twin
 * (request-journey-sql.ts) does for the rows the list pages in (#133). */
export function filtersHiding(row: OverviewRequest, filters: ListFilters, now: Date = new Date()): ListFilterKey[] {
  const hiding: ListFilterKey[] = []
  if (!matchesStatusView(row, filters.status, now)) hiding.push("status")
  if (filters.project && filters.project !== "all" && (row.projectId ?? "none") !== filters.project) hiding.push("project")
  const query = filters.title.trim().toLocaleLowerCase()
  if (query && !(row.reframedProblem ?? row.title).toLocaleLowerCase().includes(query)) hiding.push("title")
  if (filters.requestType && !(filters.requestType === "none" ? requestLabelKeys(row).length === 0 : requestLabelKeys(row).includes(filters.requestType))) hiding.push("requestType")
  return hiding
}

export function matchesListFilters(row: OverviewRequest, filters: ListFilters, now: Date = new Date()) {
  return filtersHiding(row, filters, now).length === 0
}

/** Whether a row belongs in a status view: its journey status, or "due" for a row with a due tag. */
export function matchesStatusView(row: OverviewRequest, view: RequestStatusFilter, now: Date): boolean {
  if (view === "all") return true
  if (view === "due") return rowDue(row, now).kind !== "none"
  return rowJourney(row).status === view
}

export function paginateRequests<T>(items: T[], requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const pageIndex = Math.max(0, Math.min(requestedPage, pageCount - 1))
  return { rows: items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), pageIndex, pageCount }
}
