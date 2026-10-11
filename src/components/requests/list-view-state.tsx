"use client"

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { useSearchParams } from "next/navigation"
import type { ColumnFiltersState, ColumnVisibilityState, PaginationState } from "@tanstack/react-table"
import type { RequestGrouping, RequestOrdering } from "@/lib/request-overview"
import { hasRequestListContext, parseRequestListContext, requestListHref, type RequestListContext } from "@/lib/request-workspace"

export type ListViewState = RequestListContext & {
  columnVisibility: ColumnVisibilityState
  localFilters: ColumnFiltersState
  ordering: RequestOrdering
  grouping: RequestGrouping
  collapsedGroups: string[]
  pagination: PaginationState
}
type SetListView = Dispatch<SetStateAction<ListViewState>>

const initialView: ListViewState = {
  // Keep the first scan about the Request and its current owner. The other
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
ListViewStateContext.displayName = "RequestListViewState"
ListViewSetterContext.displayName = "RequestListViewSetter"
ListContextContext.displayName = "RequestListContext"

// Lives in the authenticated layout, keyed by workspace and user. Search text
// stays in memory; it is never persisted across sign-out or workspace changes.
// Plan item 1.7: the status view and Project filter live here too, so they
// survive a visit to a Request and the list URL is only a mirror of them.
export function RequestListViewProvider({ children, initialColumnVisibility }: { children: ReactNode; initialColumnVisibility?: ColumnVisibilityState }) {
  const searchParams = useSearchParams()
  const [state, setState] = useState<ListViewState>(() => ({
    ...initialView,
    ...parseRequestListContext(searchParams),
    columnVisibility: { ...initialView.columnVisibility, ...initialColumnVisibility },
  }))
  const listContext = useMemo<RequestListContext>(() => ({ status: state.status, project: state.project }), [state.status, state.project])
  return <ListViewSetterContext.Provider value={setState}>
    <ListContextContext.Provider value={listContext}>
      <ListViewStateContext.Provider value={state}>{children}</ListViewStateContext.Provider>
    </ListContextContext.Provider>
  </ListViewSetterContext.Provider>
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
