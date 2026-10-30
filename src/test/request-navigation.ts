import { bindRequestNavigation, createRequestNavigation } from "@/components/requests/request-navigation"
import type { ListViewState } from "@/components/requests/list-view-state"

/** The production workspace navigation owner with an in-memory browser boundary. */
export function requestNavigation() {
  let view: ListViewState = {
    status: "all", project: "all", columnVisibility: {}, localFilters: [], ordering: "newest",
    grouping: "status", collapsedGroups: [], pagination: { pageIndex: 0, pageSize: 25 },
  }
  const controller = createRequestNavigation({ getView: () => view,
    setView: next => { view = typeof next === "function" ? next(view) : next }, setDetailSession: () => {},
  })
  return bindRequestNavigation(controller, { location: () => ({ pathname: "/", search: "" }), push: () => {}, replace: () => {} })
}
