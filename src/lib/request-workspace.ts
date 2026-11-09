import type { RequestGrouping, RequestOrdering } from "./request-overview"

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

/** A214: the list's title filter (URL `?title=`, and a saved view's) is cut to the longest Request title,
 * request-schema.ts TITLE_MAX. Not imported from there, which would bring zod into the list's first load;
 * request-workspace.test.ts holds the two equal. */
export const REQUEST_TITLE_FILTER_MAX = 200

/**
 * #275: how the list shows its Requests, kept in its address beside the list context: the order, the grouping, the
 * folded groups and each group's shown count (list-view-model.ts). Group keys are `<grouping>:<id>`; the address
 * names only the id, so `?folded=done&shown=open.50`.
 */
export type ListDisplay = { ordering: RequestOrdering; grouping: RequestGrouping; collapsedGroups: string[]; shownCounts: Record<string, number> }

const ORDERINGS: readonly RequestOrdering[] = ["newest", "oldest", "title", "title_desc", "status"]
const GROUPINGS: readonly RequestGrouping[] = ["status", "none", "project", "assignee"]
/** Left out of the address. */
export const LIST_DISPLAY_DEFAULTS: Readonly<ListDisplay> = { ordering: "newest", grouping: "status", collapsedGroups: [], shownCounts: {} }
/** A212: each group shows this many Requests at first, and each Show more adds as many again (list-view-model.ts). */
export const SHOWN_STEP = 25
/** No list holds more; a shared link can't ask for an endless one. */
const SHOWN_MAX = 1000
const GROUP_ID = /^[\w-]+$/
const SHOWN = /^([\w-]+)\.(\d+)$/
/** A group key is its grouping's prefix and an id; with no grouping, the one group's key is "all". */
const prefixOf = (grouping: RequestGrouping) => grouping === "none" ? "" : `${grouping}:`

function displayQuery(query: URLSearchParams, display: Partial<ListDisplay>) {
  const { ordering, grouping, collapsedGroups, shownCounts } = { ...LIST_DISPLAY_DEFAULTS, ...display }
  if (ordering !== LIST_DISPLAY_DEFAULTS.ordering) query.set("order", ordering)
  if (grouping !== LIST_DISPLAY_DEFAULTS.grouping) query.set("group", grouping)
  const prefix = prefixOf(grouping)
  // This grouping's ids, once each and in one order, so one list has one address.
  const ids = (keys: string[]) => [...new Set(keys.filter(key => prefix ? key.startsWith(prefix) : key === "all").map(key => key.slice(prefix.length)))].sort()
  if (prefix) for (const id of ids(collapsedGroups)) query.append("folded", id)
  for (const id of ids(Object.keys(shownCounts))) if (shownCounts[prefix + id] !== SHOWN_STEP) query.append("shown", `${id}.${shownCounts[prefix + id]}`)
}

/** Reads the list's display from an address. A missing or unknown value reads as its default. */
export function parseListDisplay(params: SearchParamsLike & { getAll(name: string): string[] }): ListDisplay {
  const ordering = ORDERINGS.find(item => item === params.get("order")) ?? LIST_DISPLAY_DEFAULTS.ordering
  const grouping = GROUPINGS.find(item => item === params.get("group")) ?? LIST_DISPLAY_DEFAULTS.grouping
  const prefix = prefixOf(grouping)
  const collapsedGroups = prefix ? [...new Set(params.getAll("folded").filter(id => GROUP_ID.test(id)).map(id => prefix + id))] : []
  const shownCounts: Record<string, number> = {}
  for (const value of params.getAll("shown")) {
    const [, id, count] = SHOWN.exec(value) ?? []
    if (id && (prefix || id === "all") && +count > 0 && +count !== SHOWN_STEP) shownCounts[prefix + id] = Math.min(+count, SHOWN_MAX)
  }
  return { ordering, grouping, collapsedGroups, shownCounts }
}

function requestQuery(filter: RequestStatusFilter, projectFilter: RequestProjectFilter, title = "", display?: Partial<ListDisplay>) {
  const query = new URLSearchParams()
  if (filter !== "all") query.set("status", filter)
  if (projectFilter !== "all") query.set("project", projectFilter)
  if (title.trim()) query.set("title", title)
  if (display) displayQuery(query, display)
  return query.size ? `?${query}` : ""
}

/** The Requests list's address: the list context, and with `display` (#275) how it shows, defaults left out. */
export function requestListHref(filter: RequestStatusFilter, projectFilter: RequestProjectFilter = "all", title = "", display?: Partial<ListDisplay>) {
  return `/${requestQuery(filter, projectFilter, title, display)}`
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

const ADDRESS_KEYS = ["status", "project", "title", "order", "group", "folded", "shown"]

/** True when a URL query names any part of the list: a status view, a Project, a title filter or (#275) its display. */
export function hasRequestListContext(params: SearchParamsLike | null | undefined) {
  return ADDRESS_KEYS.some(key => params?.has(key))
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
