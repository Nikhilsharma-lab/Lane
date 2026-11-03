import { TITLE_MAX } from "./request-constants"
/**
 * The list's status views (URL `?status=`): every Request, each of the five journey statuses
 * (request-journey.ts), "due" for Measuring Requests due soon, due today or overdue (#133), and "waiting" for Guest
 * submissions waiting to be taken on (review of #195), which are always Open.
 */
export const REQUEST_STATUS_FILTERS = [
  "all",
  "open",
  "in_progress",
  "done",
  "measuring",
  "closed",
  "due",
  "waiting",
] as const

/** Each status view's words, shared by the list's views, its filter menu and the ⌘K palette. */
export const REQUEST_STATUS_FILTER_LABELS = {
  all: "All", open: "Open", in_progress: "In progress", done: "Done", measuring: "Measuring", closed: "Closed", due: "Due soon or overdue", waiting: "Waiting to be taken on",
} as const satisfies Record<(typeof REQUEST_STATUS_FILTERS)[number], string>

export type RequestStatusFilter = (typeof REQUEST_STATUS_FILTERS)[number]

/** The status views that page from the database: every finished Request ("all"), or one finished view (#133). */
export const FINISHED_VIEWS = ["all", "done", "measuring", "closed", "due"] as const satisfies readonly RequestStatusFilter[]
export type FinishedView = (typeof FINISHED_VIEWS)[number]

/** The finished view a status view pages through, or null for Open, In progress and waiting Guest submissions (Open, always loaded in full). */
export const finishedViewOf = (status: RequestStatusFilter): FinishedView | null => status === "open" || status === "in_progress" || status === "waiting" ? null : status
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

/** A214: the list's title filter (URL `?title=`, and a saved view's) is cut to the longest Request title. */
export const REQUEST_TITLE_FILTER_MAX = TITLE_MAX

function requestQuery(filter: RequestStatusFilter, projectFilter: RequestProjectFilter, title = "") {
  const query = new URLSearchParams()
  if (filter !== "all") query.set("status", filter)
  if (projectFilter !== "all") query.set("project", projectFilter)
  if (title.trim()) query.set("title", title)
  return query.size ? `?${query}` : ""
}

export function requestListHref(filter: RequestStatusFilter, projectFilter: RequestProjectFilter = "all", title = "") {
  return `/${requestQuery(filter, projectFilter, title)}`
}

export function requestDetailHref(
  requestId: string,
  filter: RequestStatusFilter,
  projectFilter: RequestProjectFilter = "all"
) {
  const path = `/requests/${requestId}`
  return `${path}${requestQuery(filter, projectFilter)}`
}

/**
 * The list context a page holds in layout state: the status view, the Project filter and (A214) the title filter.
 * A missing title means "keep the title as it is" where a context is applied, and no title where one is read.
 */
export type RequestListContext = { status: RequestStatusFilter; project: RequestProjectFilter; title?: string }

type SearchParamsLike = { get(name: string): string | null; has(name: string): boolean }

/** Reads the list context of a URL query. Absent values mean "all", and no title; a title is kept as typed, cut to REQUEST_TITLE_FILTER_MAX. */
export function parseRequestListContext(params: SearchParamsLike | null | undefined): Required<RequestListContext> {
  return {
    status: parseRequestStatusFilter(params?.get("status") ?? undefined),
    project: parseRequestProjectFilter(params?.get("project")),
    title: (params?.get("title") ?? "").slice(0, REQUEST_TITLE_FILTER_MAX),
  }
}

/** True when a URL query names a status view, a Project filter or a title filter. */
export function hasRequestListContext(params: SearchParamsLike | null | undefined) {
  return Boolean(params?.has("status") || params?.has("project") || params?.has("title"))
}

/**
 * The list context of an in-app Requests list link ("/" with an optional query), or null for any other link.
 * The title is named only when the link has one, so a status or Project link keeps the title being filtered by.
 */
export function requestListContextFromHref(href: string): RequestListContext | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null
  const url = new URL(href, "https://lane.invalid")
  if (url.pathname !== "/" || url.hash) return null
  const context: RequestListContext = parseRequestListContext(url.searchParams)
  if (!url.searchParams.has("title")) delete context.title
  return context
}

/** Already on "/", a Requests list link (a view, a Project, No Project) changes the list in place with no request; elsewhere it navigates. */
export function changesListInPlace(pathname: string, href: string) {
  return pathname === "/" && requestListContextFromHref(href) !== null
}
