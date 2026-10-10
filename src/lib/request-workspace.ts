export const REQUEST_STATUS_FILTERS = [
  "all",
  "open",
  "in_progress",
  "done",
] as const

export type RequestStatusFilter = (typeof REQUEST_STATUS_FILTERS)[number]
// "all", "none", or a Project ID. IDs are authorized at the server boundary.
export type RequestProjectFilter = string

export function isRequestStatusFilter(
  value: string | null | undefined
): value is RequestStatusFilter {
  return REQUEST_STATUS_FILTERS.some((filter) => filter === value)
}

export function parseRequestStatusFilter(
  value: string | string[] | undefined
): RequestStatusFilter {
  const candidate = Array.isArray(value) ? value[0] : value
  return isRequestStatusFilter(candidate) ? candidate : "all"
}

export function parseRequestProjectFilter(
  value: string | string[] | null | undefined
): RequestProjectFilter {
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) return candidate.toLowerCase()
  return candidate ?? "all"
}

function requestQuery(filter: RequestStatusFilter, projectFilter: RequestProjectFilter) {
  const query = new URLSearchParams()
  if (filter !== "all") query.set("status", filter)
  if (projectFilter !== "all") query.set("project", projectFilter)
  return query.size ? `?${query}` : ""
}

export function requestListHref(filter: RequestStatusFilter, projectFilter: RequestProjectFilter = "all") {
  return `/${requestQuery(filter, projectFilter)}`
}

export function requestDetailHref(
  requestId: string,
  filter: RequestStatusFilter,
  projectFilter: RequestProjectFilter = "all"
) {
  const path = `/requests/${requestId}`
  return `${path}${requestQuery(filter, projectFilter)}`
}
