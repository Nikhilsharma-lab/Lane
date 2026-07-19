export const REQUEST_STATUS_FILTERS = [
  "all",
  "open",
  "in_progress",
  "done",
] as const

export type RequestStatusFilter = (typeof REQUEST_STATUS_FILTERS)[number]

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

export function requestListHref(filter: RequestStatusFilter) {
  return filter === "all" ? "/" : `/?status=${filter}`
}

export function requestDetailHref(
  requestId: string,
  filter: RequestStatusFilter
) {
  const path = `/requests/${requestId}`
  return filter === "all" ? path : `${path}?status=${filter}`
}
