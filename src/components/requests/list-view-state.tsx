"use client"

import { listFiltersOf } from "./list-view-model"
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { useSearchParams } from "next/navigation"
import type { ColumnFiltersState, ColumnVisibilityState, PaginationState } from "@tanstack/react-table"
import { filtersHiding, type ListFilters, type OverviewRequest, type RequestGrouping, type RequestOrdering } from "@/lib/request-overview"
import { hasRequestListContext, parseRequestListContext, requestListHref, type RequestListContext } from "@/lib/request-workspace"
import type { DetailSequence } from "./request-sequence"

export type ListViewState = RequestListContext & {
  columnVisibility: ColumnVisibilityState
  localFilters: ColumnFiltersState
  ordering: RequestOrdering
  grouping: RequestGrouping
  collapsedGroups: string[]
  pagination: PaginationState
  /** Plan item 2.3: a Request the list should bring into view and focus once, then clear. */
  reveal?: string
}
export type SetListView = Dispatch<SetStateAction<ListViewState>>

const initialView: ListViewState = {
  // Keep the first scan about the Request and its current assignee. The other
  // fields remain available in the Display control when a team needs them.
  columnVisibility: { requestType: true, submittedBy: false }, localFilters: [], ordering: "newest", grouping: "status", collapsedGroups: [],
  pagination: { pageIndex: 0, pageSize: 25 },
  status: "all", project: "all",
}

// Plan item 1.14: state and setter live in separate contexts, so a component
// that only changes the view (row properties, sidebar links) does not
// re-render on every keystroke in the in-list filter. The list context
// (status view and Project) has its own context for the same reason.
const ListViewStateContext = createContext<ListViewState | null>(null)
const ListViewSetterContext = createContext<SetListView | null>(null)
const ListContextContext = createContext<RequestListContext | null>(null)
const ListViewSnapshotContext = createContext<(() => ListViewState) | null>(null)
ListViewStateContext.displayName = "RequestListViewState"
ListViewSnapshotContext.displayName = "RequestListViewSnapshot"
ListViewSetterContext.displayName = "RequestListViewSetter"
ListContextContext.displayName = "RequestListContext"

/**
 * Plan item 2.5: what Request detail keeps between Requests. The sequence the
 * list was showing when a Request was opened from it (previous and next),
 * whether the next detail should focus its title on arrival (opened from the
 * list, or J and K), and each Request's unsent comment draft. Memory only,
 * keyed with the layout, so sign-out and a workspace switch drop it.
 */
export type DetailSession = {
  sequence: DetailSequence | null
  focusTitleOnArrival: boolean
  /** J or K pressed as an arrow on the previous or next button: the new detail focuses that button instead of the title. */
  focusOnArrival: "previous" | "next" | null
  /** Unsent comment drafts by Request id. A ref-held map: writing a draft re-renders nothing. */
  commentDrafts: Map<string, string>
}
export type DetailSessionPatch = Partial<Pick<DetailSession, "sequence" | "focusTitleOnArrival" | "focusOnArrival">>
type SetDetailSession = (patch: DetailSessionPatch) => void

// Separate contexts again (the item 1.14 pattern): the list never re-renders when detail's session changes.
const DetailSessionContext = createContext<DetailSession | null>(null)
// Plan item 2.8: the Requests the list last loaded, for workspace search's instant local matches.
// A ref-held list: publishing rows re-renders nothing, and search reads it on each keystroke.
type LoadedRequestsStore = { get: () => readonly OverviewRequest[]; set: (rows: readonly OverviewRequest[]) => void }
const LoadedRequestsContext = createContext<LoadedRequestsStore | null>(null)
function createLoadedRequestsStore(): LoadedRequestsStore {
  let rows: readonly OverviewRequest[] = []
  return { get: () => rows, set: next => { rows = next } }
}
const noLoadedRequests = () => []
LoadedRequestsContext.displayName = "LoadedRequests"
const DetailSessionSetterContext = createContext<SetDetailSession | null>(null)
DetailSessionContext.displayName = "RequestDetailSession"
DetailSessionSetterContext.displayName = "RequestDetailSessionSetter"

// Lives in the authenticated layout, keyed by workspace and user. Search text
// stays in memory; it is never persisted across sign-out or workspace changes.
// Plan item 1.7: the status view and Project filter live here too, so they
// survive a visit to a Request and the list URL is only a mirror of them.
export function RequestListViewProvider({ children, initialColumnVisibility, initialDetailSession }: { children: ReactNode; initialColumnVisibility?: ColumnVisibilityState
  /** Fixtures only: a detail session as if a Request had been opened from the list. */
  initialDetailSession?: DetailSessionPatch }) {
  const searchParams = useSearchParams()
  const [state, setState] = useState<ListViewState>(() => ({
    ...initialView,
    ...parseRequestListContext(searchParams),
    columnVisibility: { ...initialView.columnVisibility, ...initialColumnVisibility },
  }))
  const listContext = useMemo<RequestListContext>(() => ({ status: state.status, project: state.project }), [state.status, state.project])
  const latest = useRef(state)
  useLayoutEffect(() => { latest.current = state }, [state])
  const snapshot = useCallback(() => latest.current, [])
  const [drafts] = useState(() => new Map<string, string>())
  const [session, setSession] = useState<Omit<DetailSession, "commentDrafts">>(() => ({ sequence: null, focusTitleOnArrival: false, focusOnArrival: null, ...initialDetailSession }))
  const detailSession = useMemo<DetailSession>(() => ({ ...session, commentDrafts: drafts }), [session, drafts])
  const setDetailSession = useCallback<SetDetailSession>(patch => setSession(current => ({ ...current, ...patch })), [])
  const [loadedRequests] = useState(createLoadedRequestsStore)
  return <LoadedRequestsContext.Provider value={loadedRequests}><ListViewSetterContext.Provider value={setState}>
    <ListViewSnapshotContext.Provider value={snapshot}>
      <ListContextContext.Provider value={listContext}>
        <DetailSessionSetterContext.Provider value={setDetailSession}>
          <DetailSessionContext.Provider value={detailSession}>
            <ListViewStateContext.Provider value={state}>{children}</ListViewStateContext.Provider>
          </DetailSessionContext.Provider>
        </DetailSessionSetterContext.Provider>
      </ListContextContext.Provider>
    </ListViewSnapshotContext.Provider>
  </ListViewSetterContext.Provider></LoadedRequestsContext.Provider>
}

/** Plan item 2.8: the Requests list records the rows it loaded; nothing re-renders. They stay after leaving the list, until the layout's key changes. */
export function usePublishLoadedRequests(rows: readonly OverviewRequest[]) {
  const store = useContext(LoadedRequestsContext)
  useLayoutEffect(() => { store?.set(rows) }, [store, rows])
}

/** Plan item 2.8: reads the loaded Requests when called (empty outside the provider). Never re-renders. */
export function useLoadedRequests(): () => readonly OverviewRequest[] {
  const store = useContext(LoadedRequestsContext)
  return store?.get ?? noLoadedRequests
}

/** The whole view and its setter. Outside the provider (older fixtures) it falls back to local state. */
export function useRequestListView(): [ListViewState, SetListView] {
  const state = useContext(ListViewStateContext)
  const setState = useContext(ListViewSetterContext)
  const local = useState(initialView)
  return state && setState ? [state, setState] : local
}

/** Only the setter: never re-renders when the view changes. */
export function useSetRequestListView(): SetListView {
  const setState = useContext(ListViewSetterContext)
  const [, setLocal] = useState(initialView)
  return setState ?? setLocal
}

/** Plan item 2.3: reads the current view when called, for an event handler.
 * Never re-renders on a view change; null outside the provider. */
export function useListViewSnapshot() {
  return useContext(ListViewSnapshotContext)
}

/** The filters DataTable applies, read from a view. */
export { listFiltersOf }

/**
 * Plan item 2.3: the smallest change to the view that shows this Request.
 * Filters that already include it stay. A status view that leaves it out moves
 * to its status (Open, for a new Request); a different Project moves to its
 * Project or "No Project"; a title or type filter that leaves it out is
 * removed. The list then brings it into view and focuses it. Filters are never
 * cleared without the person asking.
 */
export function revealRequest(view: ListViewState, row: OverviewRequest): ListViewState {
  const hiding = new Set(filtersHiding(row, listFiltersOf(view)))
  const moved = withListContext(view, {
    status: hiding.has("status") ? row.status : view.status,
    project: hiding.has("project") ? row.projectId ?? "none" : view.project,
  })
  const localFilters = view.localFilters.filter(item => !hiding.has(item.id as keyof ListFilters))
  const narrowed = localFilters.length !== view.localFilters.length
  return { ...moved, localFilters, pagination: narrowed ? { ...moved.pagination, pageIndex: 0 } : moved.pagination, reveal: row.id }
}

/** Plan item 2.5: Request detail's session. Outside the provider (older fixtures) it has no sequence and keeps drafts locally. */
export function useDetailSession(): DetailSession {
  const session = useContext(DetailSessionContext)
  const [local] = useState<DetailSession>(() => ({ sequence: null, focusTitleOnArrival: false, focusOnArrival: null, commentDrafts: new Map() }))
  return session ?? local
}

/** Only the setter: never re-renders when the session changes. Does nothing outside the provider. */
export function useSetDetailSession(): SetDetailSession {
  return useContext(DetailSessionSetterContext) ?? noSession
}
const noSession: SetDetailSession = () => {}

/** The status view and Project filter, or null outside the provider. Re-renders only when either changes. */
export function useRequestListContext() {
  return useContext(ListContextContext)
}

/** Moves the list to another status view or Project and returns to the first page. */
export function withListContext(view: ListViewState, next: Partial<RequestListContext>): ListViewState {
  const status = next.status ?? view.status, project = next.project ?? view.project
  if (status === view.status && project === view.project) return view
  return { ...view, status, project, pagination: { ...view.pagination, pageIndex: 0 } }
}

/**
 * Plan item 2.1: a workspace with no Requests shows the welcome and no status
 * control, so it keeps no status view. Otherwise /?status=done would turn the
 * first Request (Open) into "No matching Requests". The Project filter stays.
 */
export function withEmptyWorkspaceStatus(view: ListViewState, workspaceEmpty: boolean): ListViewState {
  return workspaceEmpty ? withListContext(view, { status: "all" }) : view
}

export type ListUrlSyncInput = {
  /** The URL query as useSearchParams reports it now. */
  search: string
  /** The query seen on the previous run, or null on the first. */
  seen: string | null
  /** The query this page last wrote, or null. */
  written: string | null
  current: RequestListContext
  hold: boolean
  pathname: string
  /** window.location.search, with its leading "?". */
  locationSearch: string
}

/**
 * One step of the URL mirror: adopt a list context that arrived from outside
 * (a link with a query, Back, Forward), or write the current context to the
 * "/" URL. A bare "/" keeps the current context, so returning from a Request
 * keeps the Project filter. Nothing is written while `hold` is true.
 */
export function planListUrlSync({ search, seen, written, current, hold, pathname, locationSearch }: ListUrlSyncInput): { seen: string; adopt?: RequestListContext; write?: string } {
  if (search !== seen && search !== written) {
    const params = new URLSearchParams(search)
    if (hasRequestListContext(params)) {
      const next = parseRequestListContext(params)
      if (next.status !== current.status || next.project !== current.project) return { seen: search, adopt: next }
    }
  }
  if (hold || pathname !== "/") return { seen: search }
  const href = requestListHref(current.status, current.project)
  return `${pathname}${locationSearch}` === href ? { seen: search } : { seen: search, write: href }
}

/**
 * Mirrors the list context into the "/" URL with history.replaceState, which
 * makes no network request (plan item 1.7). Writing is held while `hold` is
 * true: in Next 16.2 a patched replaceState while a server action is pending
 * discards that action's revalidated payload (plan item 1.5).
 */
export function useRequestListUrlSync({ status, project }: RequestListContext, setView: SetListView, hold: boolean) {
  const searchParams = useSearchParams()
  const search = searchParams?.toString() ?? ""
  const seen = useRef<string | null>(null)
  const written = useRef<string | null>(null)
  useLayoutEffect(() => {
    const plan = planListUrlSync({ search, seen: seen.current, written: written.current, current: { status, project }, hold, pathname: window.location.pathname, locationSearch: window.location.search })
    seen.current = plan.seen
    if (plan.adopt) {
      const next = plan.adopt
      setView(view => withListContext(view, next))
    } else if (plan.write) {
      written.current = new URL(plan.write, window.location.origin).searchParams.toString()
      window.history.replaceState(null, "", plan.write)
    }
  }, [search, status, project, hold, setView])
}
