"use client"

import { listFiltersOf } from "./list-view-model"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { useSearchParams } from "next/navigation"
import type { ColumnFiltersState, ColumnVisibilityState } from "@tanstack/react-table"
import { filtersHiding, type ListFilters, type OverviewRequest, type RequestGrouping, type RequestOrdering } from "@/lib/request-overview"
import { hasRequestListContext, LIST_DISPLAY_DEFAULTS, parseListDisplay, parseRequestListContext, requestListHref, type ListDisplay, type RequestListContext } from "@/lib/request-workspace"
import { createCurrentRequestStore, resolveCurrentRequest, type CurrentRequest } from "./current-request"
import { createExternalStore } from "@/lib/external-store"
import { usePendingMutations } from "./pending-mutations-provider"
import type { DetailSequence } from "./request-sequence"
import { createRequestNavigation, RequestNavigationContext } from "./request-navigation"

export type ListViewState = Required<RequestListContext> & {
  columnVisibility: ColumnVisibilityState
  localFilters: ColumnFiltersState
  ordering: RequestOrdering
  grouping: RequestGrouping
  collapsedGroups: string[]
  /** A212: how many Requests each group shows, by group key; a group not listed shows its first 25 (list-view-model.ts). */
  shownCounts: Record<string, number>
  /** Plan item 2.3: a Request the list should bring into view and focus once, then clear. */
  reveal?: string
  /** #219: the saved view the person opened, kept while they change its filters so the change can be saved into it. */
  savedView?: string
  /** A215: the Project came from Add filter (or the summary) on the whole list, so it is a chip and Clear all clears
   * it. Any other way to a Project (the sidebar, a saved view, an address) makes it the page's own. Memory only. */
  projectAdded?: true
}
/** The status view and Project plus the open saved view (#219). The title filter (A214) changes on each keystroke, so it stays out: the sidebar reads this. */
export type OpenListContext = Omit<RequestListContext, "title"> & { savedView?: string }
export type SetListView = Dispatch<SetStateAction<ListViewState>>

const initialView: ListViewState = {
  // Keep the first scan about the Request and its current assignee. The other
  // fields remain available in the Display control when a team needs them.
  columnVisibility: { requestType: true, submittedBy: false }, localFilters: [], ...LIST_DISPLAY_DEFAULTS,
  status: "all", project: "all", title: "",
}

// Plan item 1.14: state and setter live in separate contexts, so a component
// that only changes the view (row properties, sidebar links) does not
// re-render on every keystroke in the in-list filter. The list context
// (status view and Project) has its own context for the same reason.
const ListViewStateContext = createContext<ListViewState | null>(null)
const ListViewSetterContext = createContext<SetListView | null>(null)
const ListContextContext = createContext<OpenListContext | null>(null)
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
// #103: the Request open on its page or in the preview, and the list's highlighted row, for the app shell.
const CurrentRequestContext = createContext<ReturnType<typeof createCurrentRequestStore> | null>(null)
CurrentRequestContext.displayName = "CurrentRequest"
DetailSessionContext.displayName = "RequestDetailSession"
DetailSessionSetterContext.displayName = "RequestDetailSessionSetter"

// Lives in the authenticated layout, keyed by workspace and user; nothing here
// is persisted across sign-out or workspace changes.
// Plan item 1.7: the status view and Project filter live here too, so they
// survive a visit to a Request and the list URL is only a mirror of them.
// A214: so does the title filter (`?title=`).
export function RequestListViewProvider({ children, initialColumnVisibility, initialDetailSession }: { children: ReactNode; initialColumnVisibility?: ColumnVisibilityState
  /** Fixtures only: a detail session as if a Request had been opened from the list. */
  initialDetailSession?: DetailSessionPatch }) {
  const searchParams = useSearchParams()
  const [state, setState] = useState<ListViewState>(() => ({
    ...initialView,
    ...parseRequestListContext(searchParams),
    // #275: a reload or a shared link shows the same list.
    ...(searchParams ? parseListDisplay(searchParams) : {}),
    columnVisibility: { ...initialView.columnVisibility, ...initialColumnVisibility },
  }))
  const listContext = useMemo<OpenListContext>(() => ({ status: state.status, project: state.project, savedView: state.savedView }), [state.status, state.project, state.savedView])
  const [viewStore] = useState(() => createExternalStore(state))
  const snapshot = viewStore.get
  // Navigation reads at event time, including changes queued earlier in the same event.
  const setView = useCallback<SetListView>(next => {
    const value = typeof next === "function" ? next(viewStore.get()) : next
    viewStore.set(value)
    setState(value)
  }, [viewStore])
  const [drafts] = useState(() => new Map<string, string>())
  const [session, setSession] = useState<Omit<DetailSession, "commentDrafts">>(() => ({ sequence: null, focusTitleOnArrival: false, focusOnArrival: null, ...initialDetailSession }))
  const detailSession = useMemo<DetailSession>(() => ({ ...session, commentDrafts: drafts }), [session, drafts])
  const setDetailSession = useCallback<SetDetailSession>(patch => setSession(current => ({ ...current, ...patch })), [])
  const [loadedRequests] = useState(createLoadedRequestsStore)
  const [currentRequest] = useState(createCurrentRequestStore)
  const [navigation] = useState(() => createRequestNavigation({ getView: snapshot, setView, setDetailSession }))
  useEffect(() => navigation.listenForHistory(window), [navigation])
  return <RequestNavigationContext.Provider value={navigation}><CurrentRequestContext.Provider value={currentRequest}><LoadedRequestsContext.Provider value={loadedRequests}><ListViewSetterContext.Provider value={setView}>
    <ListViewSnapshotContext.Provider value={snapshot}>
      <ListContextContext.Provider value={listContext}>
        <DetailSessionSetterContext.Provider value={setDetailSession}>
          <DetailSessionContext.Provider value={detailSession}>
            <ListViewStateContext.Provider value={state}>{children}</ListViewStateContext.Provider>
          </DetailSessionContext.Provider>
        </DetailSessionSetterContext.Provider>
      </ListContextContext.Provider>
    </ListViewSnapshotContext.Provider>
  </ListViewSetterContext.Provider></LoadedRequestsContext.Provider></CurrentRequestContext.Provider></RequestNavigationContext.Provider>
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

/** #103: Request detail (page or preview) publishes its Request while mounted. Keep `request` memoized: each new object republishes. */
export function usePublishOpenRequest(request: CurrentRequest) {
  const store = required(useContext(CurrentRequestContext), "usePublishOpenRequest")
  useLayoutEffect(() => store.setOpen(request), [store, request])
}

/** #103: the list publishes its highlighted row (the active row, not the ticked ones), or null on a group header. */
export function usePublishHighlightedRequest(id: string | null) {
  const store = required(useContext(CurrentRequestContext), "usePublishHighlightedRequest")
  useLayoutEffect(() => {
    store.setHighlighted(id)
    return () => store.setHighlighted(null)
  }, [store, id])
}

/** #103: the Request the shell acts on: the open one, else the list's highlighted row, else null. */
export function useCurrentRequest(): CurrentRequest | null {
  const store = required(useContext(CurrentRequestContext), "useCurrentRequest")
  const state = useSyncExternalStore(store.subscribe, store.get, store.get)
  const rows = useLoadedRequests()()
  const overlay = usePendingMutations()
  // One object until the Request or its pending changes change, so readers can memoize on it.
  return useMemo(() => resolveCurrentRequest(state, rows, overlay?.applyOne), [state, rows, overlay])
}

/** The (app) layout always provides the list's view and detail session. */
function required<T>(value: T | null | undefined, hook: string): T {
  if (value == null) throw new Error(`${hook} needs RequestListViewProvider (the (app) layout).`)
  return value
}

/** The whole view and its setter. */
export function useRequestListView(): [ListViewState, SetListView] {
  return [required(useContext(ListViewStateContext), "useRequestListView"), required(useContext(ListViewSetterContext), "useRequestListView")]
}

/** Only the setter: never re-renders when the view changes. */
export function useSetRequestListView(): SetListView {
  return required(useContext(ListViewSetterContext), "useSetRequestListView")
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
    title: hiding.has("title") ? "" : view.title,
  })
  const localFilters = view.localFilters.filter(item => !hiding.has(item.id as keyof ListFilters))
  const narrowed = localFilters.length !== view.localFilters.length
  return { ...moved, localFilters, shownCounts: narrowed ? {} : moved.shownCounts, reveal: row.id }
}

/** Plan item 2.5: Request detail's session. */
export function useDetailSession(): DetailSession {
  return required(useContext(DetailSessionContext), "useDetailSession")
}

/** Only the setter: never re-renders when the session changes. */
export function useSetDetailSession(): SetDetailSession {
  return required(useContext(DetailSessionSetterContext), "useSetDetailSession")
}

/** The status view, Project filter, title filter and open saved view. Re-renders only when one of them changes. */
export function useRequestListContext(): OpenListContext {
  return required(useContext(ListContextContext), "useRequestListContext")
}

/** Moves the list to another status view, Project or title filter, with each group back to its first 25. A missing part stays as it is. */
export function withListContext(view: ListViewState, next: Partial<RequestListContext>): ListViewState {
  const status = next.status ?? view.status, project = next.project ?? view.project, title = next.title ?? view.title
  if (status === view.status && project === view.project && title === view.title) return view
  return { ...view, status, project, title, shownCounts: {}, projectAdded: project === view.project ? view.projectAdded : undefined }
}

/** #219: opens a saved view (its filters, each group at its first 25), or with null closes the open one and keeps the filters. */
export function withSavedView(view: ListViewState, saved: { id: string; filters: RequestListContext } | null): ListViewState {
  if (!saved) return view.savedView === undefined ? view : { ...view, savedView: undefined }
  const moved = withListContext(view, saved.filters)
  return { ...moved, savedView: saved.id, shownCounts: {} }
}

/**
 * Plan item 2.1: a workspace with no Requests shows the welcome and no status
 * control, so it keeps no status view. Otherwise /?status=done would turn the
 * first Request (Open) into "No matching Requests". The Project filter stays.
 */
export function withEmptyWorkspaceStatus(view: ListViewState, workspaceEmpty: boolean): ListViewState {
  return workspaceEmpty ? withListContext(view, { status: "all" }) : view
}

/** #275: the whole list's address, how it shows included. */
export type ListAddress = Required<RequestListContext> & ListDisplay
type AddressOf = RequestListContext & Partial<ListDisplay>
/** The "/" address of a list context and its display (defaults left out). */
export const listViewHref = (view: AddressOf) => requestListHref(view.status, view.project, view.title, view)

/** #275: an address that arrived is the whole list: its context, order, grouping, folded groups and shown counts. */
export function withListAddress(view: ListViewState, { ordering, grouping, collapsedGroups, shownCounts, ...context }: ListAddress): ListViewState {
  return { ...withListContext(view, context), ordering, grouping, collapsedGroups, shownCounts }
}

export type ListUrlSyncInput = {
  /** The URL query as useSearchParams reports it now. */
  search: string
  /** The query seen on the previous run, or null on the first. */
  seen: string | null
  /** The query this page last wrote, or null. */
  written: string | null
  current: AddressOf
  /** A newer explicit selection has not reached the router and address bar yet. */
  localSelectionPending?: boolean
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
export function planListUrlSync({ search, seen, written, current, localSelectionPending = false, hold, pathname, locationSearch }: ListUrlSyncInput): { seen: string; adopt?: ListAddress; write?: string } {
  if (!localSelectionPending && search !== seen && search !== written) {
    const params = new URLSearchParams(search)
    if (hasRequestListContext(params)) {
      const next = { ...parseRequestListContext(params), ...parseListDisplay(params) }
      if (listViewHref(next) !== listViewHref(current)) return { seen: search, adopt: next }
    }
  }
  if (hold || pathname !== "/") return { seen: search }
  const href = listViewHref(current)
  return `${pathname}${locationSearch}` === href ? { seen: search } : { seen: search, write: href }
}

/**
 * Mirrors the list context into the "/" URL with history.replaceState, which
 * makes no network request (plan item 1.7). Writing is held while `hold` is
 * true: in Next 16.2 a patched replaceState while a server action is pending
 * discards that action's revalidated payload (plan item 1.5).
 */
export function useRequestListUrlSync({ status, project, title, ordering, grouping, collapsedGroups, shownCounts }: AddressOf, setView: SetListView, hold: boolean) {
  const searchParams = useSearchParams()
  const search = searchParams?.toString() ?? ""
  const navigation = required(useContext(RequestNavigationContext), "useRequestListUrlSync")
  const seen = useRef<string | null>(null)
  const written = useRef<string | null>(null)
  useLayoutEffect(() => {
    const plan = navigation.planListUrl({ search, seen: seen.current, written: written.current, hold, pathname: window.location.pathname, locationSearch: window.location.search })
    seen.current = plan.seen
    if (plan.adopt) {
      const next = plan.adopt
      setView(view => withListAddress(view, next))
    } else if (plan.write) {
      written.current = new URL(plan.write, window.location.origin).searchParams.toString()
      window.history.replaceState(null, "", plan.write)
    }
  }, [search, status, project, title, ordering, grouping, collapsedGroups, shownCounts, hold, setView, navigation])
}
