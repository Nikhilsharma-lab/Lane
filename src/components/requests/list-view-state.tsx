"use client"

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import type { ColumnFiltersState, ColumnVisibilityState, PaginationState } from "@tanstack/react-table"
import type { RequestGrouping, RequestOrdering } from "@/lib/request-overview"

type ListViewState = {
  columnVisibility: ColumnVisibilityState
  localFilters: ColumnFiltersState
  ordering: RequestOrdering
  grouping: RequestGrouping
  collapsedGroups: string[]
  pagination: PaginationState
}

const initialView: ListViewState = {
  // Keep the first scan about the Request and its current owner. The other
  // fields remain available in the Display control when a team needs them.
  columnVisibility: { requestType: true, submittedBy: false }, localFilters: [], ordering: "newest", grouping: "status", collapsedGroups: [],
  pagination: { pageIndex: 0, pageSize: 25 },
}
type StatePair = [ListViewState, Dispatch<SetStateAction<ListViewState>>]
const ListViewContext = createContext<StatePair | null>(null)

// Lives in the authenticated layout, keyed by workspace and user. Search text
// stays in memory; it is never persisted across sign-out or workspace changes.
export function RequestListViewProvider({ children, initialColumnVisibility }: { children: ReactNode; initialColumnVisibility?: ColumnVisibilityState }) {
  const state = useState(() => ({ ...initialView, columnVisibility: { ...initialView.columnVisibility, ...initialColumnVisibility } }))
  return <ListViewContext.Provider value={state}>{children}</ListViewContext.Provider>
}

export function useRequestListView() {
  const context = useContext(ListViewContext)
  const local = useState(initialView)
  return context ?? local
}
