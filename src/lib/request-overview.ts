import type { RequestType } from "./request-properties"
import type { RequestStatusFilter } from "./request-workspace"

export type OverviewRequest = {
  id: string
  /** Saved workspace-local number. Optional only for older illustrative fixtures. */
  requestNumber?: number
  title: string
  reframedProblem: string | null
  status: "open" | "in_progress" | "done"
  createdAt: string
  creatorName: string | null
  assigneeName: string | null
  assigneeAvatarUrl?: string | null
  assignedTo?: string | null
  projectId?: string | null
  projectName?: string | null
  requestType?: RequestType | null
}

export type RequestSort = "newest" | "oldest" | "title"
export type RequestOrdering = RequestSort | "title_desc" | "status"
export type RequestGrouping = "none" | "status" | "project" | "owner"
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

export function selectOverviewRequests(
  requests: OverviewRequest[],
  status: RequestStatusFilter,
  query: string,
  sort: RequestSort,
) {
  const search = query.trim().toLocaleLowerCase()
  return requests.filter(request => {
    if (status !== "all" && request.status !== status) return false
    return !search || [request.title, request.reframedProblem, request.creatorName, request.assigneeName]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(search)
  }).sort((a, b) => {
    if (sort === "title") return (a.reframedProblem ?? a.title).localeCompare(b.reframedProblem ?? b.title)
    const difference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return sort === "oldest" ? -difference : difference
  })
}

export function paginateRequests<T>(items: T[], requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const pageIndex = Math.max(0, Math.min(requestedPage, pageCount - 1))
  return { rows: items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), pageIndex, pageCount }
}
