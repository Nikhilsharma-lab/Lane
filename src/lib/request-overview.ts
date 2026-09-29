import type { RequestStatusFilter } from "./request-workspace"

export type OverviewRequest = {
  id: string
  title: string
  reframedProblem: string | null
  status: "open" | "in_progress" | "done"
  createdAt: string
  creatorName: string | null
  assigneeName: string | null
}

export type RequestSort = "newest" | "oldest" | "title"

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
