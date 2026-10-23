/**
 * The list's status views (URL `?status=`): every Request, each of the five journey statuses
 * (request-journey.ts), and "due" for Measuring Requests due soon, due today or overdue (#133).
 */
export const REQUEST_STATUS_FILTERS = [
  "all",
  "open",
  "in_progress",
  "done",
  "measuring",
  "closed",
  "due",
] as const

/** Each status view's words, shared by the list's views, its filter menu and the ⌘K palette. */
export const REQUEST_STATUS_FILTER_LABELS = {
  all: "All", open: "Open", in_progress: "In progress", done: "Done", measuring: "Measuring", closed: "Closed", due: "Due soon or overdue",
} as const satisfies Record<(typeof REQUEST_STATUS_FILTERS)[number], string>

export type RequestStatusFilter = (typeof REQUEST_STATUS_FILTERS)[number]

/** The status views that page from the database: every finished Request ("all"), or one finished view (#133). */
export const FINISHED_VIEWS = ["all", "done", "measuring", "closed", "due"] as const satisfies readonly RequestStatusFilter[]
export type FinishedView = (typeof FINISHED_VIEWS)[number]

/** The finished view a status view pages through, or null for Open and In progress (always loaded in full). */
export const finishedViewOf = (status: RequestStatusFilter): FinishedView | null => status === "open" || status === "in_progress" ? null : status
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

/** The list context a page holds in layout state: the status view and the Project filter. */
export type RequestListContext = { status: RequestStatusFilter; project: RequestProjectFilter }

type SearchParamsLike = { get(name: string): string | null; has(name: string): boolean }

/** Reads the list context of a URL query. Absent values mean "all". */
export function parseRequestListContext(params: SearchParamsLike | null | undefined): RequestListContext {
  return {
    status: parseRequestStatusFilter(params?.get("status") ?? undefined),
    project: parseRequestProjectFilter(params?.get("project")),
  }
}

/** True when a URL query names a status view or a Project filter. */
export function hasRequestListContext(params: SearchParamsLike | null | undefined) {
  return Boolean(params?.has("status") || params?.has("project"))
}

/** The list context of an in-app Requests list link ("/" with an optional query), or null for any other link. */
export function requestListContextFromHref(href: string): RequestListContext | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null
  const url = new URL(href, "https://lane.invalid")
  if (url.pathname !== "/" || url.hash) return null
  return parseRequestListContext(url.searchParams)
}

/** Already on "/", a Requests list link (a view, a Project, No Project) changes the list in place with no request; elsewhere it navigates. */
export function changesListInPlace(pathname: string, href: string) {
  return pathname === "/" && requestListContextFromHref(href) !== null
}
