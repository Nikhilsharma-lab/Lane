import { createElement, type Context } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Record which contexts each hook reads; the real React does the reading.
const reads = vi.hoisted(() => ({ names: [] as string[], search: "" }))
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>()
  return { ...actual, useContext: <T,>(context: Context<T>) => { reads.names.push(context.displayName ?? "unnamed"); return actual.useContext(context) } }
})
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(reads.search) }))

import { RequestListViewProvider, listFiltersOf, planListUrlSync, revealRequest, useListViewSnapshot, useRequestListContext, useRequestListView, useSetRequestListView, withEmptyWorkspaceStatus, withListAddress, withListContext, withSavedView, type ListViewState } from "./list-view-state"
import type { OverviewRequest } from "@/lib/request-overview"
import { withListFilter, withoutAddedFilters, withoutListFilters } from "./list-filters"
import { LIST_DISPLAY_DEFAULTS } from "@/lib/request-workspace"
import { SHOWN_STEP } from "./list-view-model"

beforeEach(() => { reads.names = []; reads.search = "" })

function renderInProvider(consumer: () => string) {
  return renderToStaticMarkup(createElement(RequestListViewProvider, null, createElement(() => { reads.names = []; return consumer() })))
}

describe("Request list view contexts (plan item 1.14)", () => {
  it("lets a setter-only consumer skip the view state, so typing in the filter does not re-render it", () => {
    renderInProvider(() => { useSetRequestListView(); return "setter" })
    expect(reads.names).toEqual(["RequestListViewSetter"])
  })

  it("gives the list context its own context, apart from the full view", () => {
    reads.search = "status=in_progress&project=none"
    expect(renderInProvider(() => { const context = useRequestListContext(); return `${context?.status}:${context?.project}` })).toBe("in_progress:none")
    expect(reads.names).toEqual(["RequestListContext"])
    expect(renderInProvider(() => { const [view] = useRequestListView(); return `${view.status}:${view.project}:${view.grouping}` })).toBe("in_progress:none:status")
  })
})

describe("an open saved view (#219)", () => {
  const view = { status: "done", project: "none", shownCounts: { "status:done": 50 } as ListViewState["shownCounts"] } as ListViewState
  const saved = { id: "view-1", name: "Open work", filters: { status: "open" as const, project: "11111111-1111-4111-8111-111111111111" } }

  it("applies its filters with each group at its first 25 and remembers which view is open", () => {
    expect(withSavedView(view, saved)).toMatchObject({ status: "open", project: saved.filters.project, savedView: "view-1" })
    expect(withSavedView(view, saved).shownCounts).toEqual({})
  })

  it("stays open while the person changes the filters, so the change can be saved into it", () => {
    expect(withListContext(withSavedView(view, saved), { status: "closed" })).toMatchObject({ status: "closed", savedView: "view-1" })
  })

  it("closes without touching the filters", () => {
    expect(withSavedView(withSavedView(view, saved), null)).toMatchObject({ status: "open", project: saved.filters.project, savedView: undefined })
  })

  it("is part of the list context", () => {
    reads.search = "status=open"
    expect(renderInProvider(() => { const context = useRequestListContext(); return `${context.status}:${context.savedView ?? "none"}` })).toBe("open:none")
  })
})

describe("Request list context (plan item 1.7)", () => {
  const view = { status: "all", project: "all", shownCounts: { "status:open": 75 } as ListViewState["shownCounts"] } as ListViewState

  it("puts each group back to its first 25 on a new status view or Project and keeps the view otherwise", () => {
    expect(withListContext(view, { project: "none" })).toMatchObject({ status: "all", project: "none" })
    expect(withListContext(view, { project: "none" }).shownCounts).toEqual({})
    expect(withListContext(view, { status: "all", project: "all" })).toBe(view)
  })

  const base = { seen: "", written: null, current: { status: "all", project: "all" } as const, hold: false, pathname: "/", locationSearch: "" }

  it("adopts a status view or Project that arrives in the URL", () => {
    expect(planListUrlSync({ ...base, search: "project=none", seen: null, locationSearch: "?project=none" })).toEqual({ seen: "project=none", adopt: { status: "all", project: "none", title: "", ...LIST_DISPLAY_DEFAULTS } })
  })

  it("keeps the current context on a bare return to the list and writes it to the URL", () => {
    expect(planListUrlSync({ ...base, search: "", seen: null, current: { status: "open", project: "none" } })).toEqual({ seen: "", write: "/?status=open&project=none" })
  })

  it("holds the URL while a mutation is pending and writes once it settles", () => {
    const current = { status: "done", project: "all" } as const
    expect(planListUrlSync({ ...base, search: "", current, hold: true })).toEqual({ seen: "" })
    expect(planListUrlSync({ ...base, search: "", current })).toEqual({ seen: "", write: "/?status=done" })
  })

  it("does not adopt the query it wrote itself, and writes nothing off the list", () => {
    expect(planListUrlSync({ ...base, search: "status=open", written: "status=open", current: { status: "done", project: "all" }, locationSearch: "?status=open" })).toEqual({ seen: "status=open", write: "/?status=done" })
    expect(planListUrlSync({ ...base, search: "", current: { status: "open", project: "all" }, pathname: "/requests/request-1" })).toEqual({ seen: "" })
  })
})

describe("The title filter in the list context (A214)", () => {
  const view = { status: "open", project: "all", title: "", localFilters: [] as ListViewState["localFilters"], shownCounts: { "status:open": 50 } as ListViewState["shownCounts"] } as ListViewState
  const base = { written: null, hold: false, pathname: "/" }

  it("starts from the address, as status and Project do", () => {
    reads.search = "status=open&title=checkout"
    expect(renderInProvider(() => `${useRequestListContext().status}:${useRequestListView()[0].title}`)).toBe("open:checkout")
    // Kept apart from the list context, so the sidebar doesn't re-render on each keystroke.
    expect(renderInProvider(() => Object.keys(useRequestListContext()).filter(key => key !== "savedView").join(","))).toBe("status,project")
    expect(renderInProvider(() => { const [state] = useRequestListView(); return listFiltersOf(state).title })).toBe("checkout")
  })

  it("puts each group back to its first 25 when it changes, and a context without a title keeps it", () => {
    const filtered = withListContext(view, { title: "checkout" })
    expect(filtered).toMatchObject({ title: "checkout" })
    expect(filtered.shownCounts).toEqual({})
    expect(withListContext(filtered, { project: "none" })).toMatchObject({ project: "none", title: "checkout" })
    expect(withListContext(filtered, { title: "checkout" })).toBe(filtered)
  })

  it("is written to the address with the status view", () => {
    expect(planListUrlSync({ ...base, search: "status=open", seen: "status=open", current: { status: "open", project: "all", title: "check out" }, locationSearch: "?status=open" })).toEqual({ seen: "status=open", write: "/?status=open&title=check+out" })
  })

  it("is adopted from an address that arrives (Back, Forward, a link), and cleared by one without it", () => {
    expect(planListUrlSync({ ...base, search: "title=checkout", seen: null, current: { status: "all", project: "all", title: "" }, locationSearch: "?title=checkout" })).toEqual({ seen: "title=checkout", adopt: { status: "all", project: "all", title: "checkout", ...LIST_DISPLAY_DEFAULTS } })
    expect(planListUrlSync({ ...base, search: "status=open", seen: "status=open&title=checkout", current: { status: "open", project: "all", title: "checkout" }, locationSearch: "?status=open" })).toEqual({ seen: "status=open", adopt: { status: "open", project: "all", title: "", ...LIST_DISPLAY_DEFAULTS } })
  })

  it("is changed and cleared with the other list filters, each group back at its first 25", () => {
    const filtered = withListFilter(withListFilter(view, "title", "checkout"), "requestType", "bug")
    expect(filtered).toMatchObject({ title: "checkout", localFilters: [{ id: "requestType", value: "bug" }] })
    expect(withListFilter({ ...filtered, shownCounts: { "status:open": 50 } }, "requestType", "").shownCounts).toEqual({})
    expect(withListFilter(filtered, "project", "")).toMatchObject({ project: "all", title: "checkout" })
    const cleared = withoutListFilters({ ...filtered, shownCounts: { "status:open": 50 } })
    expect(cleared).toMatchObject({ status: "all", project: "all", title: "", localFilters: [] })
    expect(cleared.shownCounts).toEqual({})
  })

  it("A215: Clear all clears a Project added from Add filter, never a Project page's own Project", () => {
    const added = withListFilter(withListFilter(view, "project", "p1"), "title", "checkout")
    expect(added).toMatchObject({ project: "p1", projectAdded: true })
    expect(withoutAddedFilters(added)).toMatchObject({ project: "all", title: "" })
    const page = withListFilter(withListContext(view, { project: "p1" }), "title", "checkout")
    expect(page.projectAdded).toBeFalsy()
    expect(withoutAddedFilters(page)).toMatchObject({ project: "p1", title: "" })
    // Moving to another Project (the sidebar, a saved view) makes it the page's own.
    expect(withListContext(added, { project: "p2" }).projectAdded).toBeFalsy()
  })

  it("comes back with a saved view", () => {
    const typed = withListContext(view, { title: "pricing" })
    expect(withSavedView(typed, { id: "v1", filters: { status: "all", project: "all", title: "checkout" } })).toMatchObject({ title: "checkout", savedView: "v1" })
    // The sidebar opens a view with all its filters, so one saved without a title clears it (e2e A214).
    expect(withSavedView(typed, { id: "v2", filters: { status: "all", project: "all", title: "" } })).toMatchObject({ title: "", savedView: "v2" })
  })
})

describe("An empty workspace's status view (plan item 2.1)", () => {
  const view = { status: "done", project: "none", shownCounts: { "status:done": 50 } as ListViewState["shownCounts"] } as ListViewState

  it("drops a status view while the workspace has no Requests, keeping the Project", () => {
    expect(withEmptyWorkspaceStatus(view, true)).toMatchObject({ status: "all", project: "none" })
    expect(withEmptyWorkspaceStatus(view, true).shownCounts).toEqual({})
    expect(withEmptyWorkspaceStatus(view, false)).toBe(view)
    const all = { ...view, status: "all" } as ListViewState
    expect(withEmptyWorkspaceStatus(all, true)).toBe(all)
  })

  it("mirrors the dropped status into the URL without adopting it back, and only once no mutation is pending", () => {
    const base = { written: null, hold: false, pathname: "/" }
    // First paint of /?status=done: the view already matches the URL.
    const first = planListUrlSync({ ...base, search: "status=done", seen: null, current: { status: "done", project: "all" }, locationSearch: "?status=done" })
    expect(first).toEqual({ seen: "status=done" })
    // The empty workspace drops it. The same query is not adopted again; "/" is written, or held.
    const current = withEmptyWorkspaceStatus({ ...view, status: "done", project: "all" }, true)
    expect(planListUrlSync({ ...base, search: "status=done", seen: first.seen, current, hold: true, locationSearch: "?status=done" })).toEqual({ seen: "status=done" })
    expect(planListUrlSync({ ...base, search: "status=done", seen: first.seen, current, locationSearch: "?status=done" })).toEqual({ seen: "status=done", write: "/" })
  })
})

describe("Showing a Request the filters hide (plan item 2.3)", () => {
  const view = {
    status: "done", project: "p2", title: "pricing", localFilters: [{ id: "requestType", value: "bug" }],
    shownCounts: { "status:done": 50 }, collapsedGroups: ["status:open"], ordering: "newest", grouping: "status", columnVisibility: {},
  } as ListViewState
  const created: OverviewRequest = { id: "new", title: "Checkout drops at the phone step", reframedProblem: null, status: "open", createdAt: "2026-10-11T10:00:00Z", creatorName: null, assigneeName: null, projectId: "p1", requestType: "bug" }

  it("reads the list's filters from a view", () => {
    expect(listFiltersOf(view)).toEqual({ status: "done", project: "p2", title: "pricing", requestType: "bug" })
  })

  it("moves to the smallest view that holds the Request, keeps filters that include it, and asks the list to reveal it", () => {
    const next = revealRequest(view, created)
    expect(next).toMatchObject({ status: "open", project: "p1", title: "", localFilters: [{ id: "requestType", value: "bug" }], reveal: "new" })
    expect(next.shownCounts).toEqual({})
    // A collapsed group is not a filter; the list expands it when it reveals the row.
    expect(next.collapsedGroups).toEqual(["status:open"])
  })

  it("moves a Request with no Project to No Project, and keeps a view that already holds it", () => {
    expect(revealRequest(view, { ...created, projectId: null }).project).toBe("none")
    const holding = { ...view, status: "all", project: "all", title: "", localFilters: [] } as ListViewState
    const next = revealRequest(holding, created)
    expect(next).toMatchObject({ status: "all", project: "all", localFilters: [], shownCounts: holding.shownCounts, reveal: "new" })
  })

  it("gives the composer a getter for the view that reads no context on render", () => {
    reads.search = "status=open"
    expect(renderInProvider(() => { const read = useListViewSnapshot(); return typeof read })).toBe("function")
    expect(reads.names).toEqual(["RequestListViewSnapshot"])
  })
})

describe("The list's display in its address (#275)", () => {
  const base = { written: null, hold: false, pathname: "/" }
  const display = { ordering: "oldest", grouping: "status", collapsedGroups: ["status:done"], shownCounts: { "status:open": 50 } } as const
  const shown = { ...display, collapsedGroups: [...display.collapsedGroups] }

  it("starts from the address on a reload or a shared link", () => {
    reads.search = "status=open&order=oldest&folded=done&shown=open.50"
    expect(renderInProvider(() => { const [view] = useRequestListView(); return [view.status, view.ordering, view.grouping, view.collapsedGroups, Object.entries(view.shownCounts)].join(" ") }))
      .toBe("open oldest status status:done status:open,50")
  })

  it("is written to the address with the list context, defaults left out", () => {
    expect(planListUrlSync({ ...base, search: "", seen: "", current: { status: "open", project: "all", ...shown }, locationSearch: "" }))
      .toEqual({ seen: "", write: "/?status=open&order=oldest&folded=done&shown=open.50" })
    expect(planListUrlSync({ ...base, search: "", seen: "", current: { status: "all", project: "all", ...LIST_DISPLAY_DEFAULTS, shownCounts: { "status:open": SHOWN_STEP } }, locationSearch: "" }))
      .toEqual({ seen: "" })
  })

  it("is adopted from an address that arrives (Back, Forward, a link), and a key it leaves out goes back to its default", () => {
    expect(planListUrlSync({ ...base, search: "order=oldest&folded=done&shown=open.50", seen: null, current: { status: "all", project: "all", title: "" }, locationSearch: "?order=oldest&folded=done&shown=open.50" }))
      .toEqual({ seen: "order=oldest&folded=done&shown=open.50", adopt: { status: "all", project: "all", title: "", ...display } })
    expect(planListUrlSync({ ...base, search: "status=open", seen: "status=open&order=oldest", current: { status: "open", project: "all", ...shown }, locationSearch: "?status=open" }))
      .toEqual({ seen: "status=open", adopt: { status: "open", project: "all", title: "", ...LIST_DISPLAY_DEFAULTS } })
  })

  it("keeps the display on a bare return to the list, and adopts nothing that already matches", () => {
    expect(planListUrlSync({ ...base, search: "", seen: null, current: { status: "all", project: "all", ...shown }, locationSearch: "" }))
      .toEqual({ seen: "", write: "/?order=oldest&folded=done&shown=open.50" })
    expect(planListUrlSync({ ...base, search: "folded=done&order=oldest&shown=open.50", seen: null, current: { status: "all", project: "all", ...shown }, locationSearch: "?folded=done&order=oldest&shown=open.50" }))
      .toEqual({ seen: "folded=done&order=oldest&shown=open.50", write: "/?order=oldest&folded=done&shown=open.50" })
  })

  it("applies an adopted address as the whole list", () => {
    const view = { ...initialLike(), status: "open", shownCounts: { "status:open": 75 }, savedView: "v1" } as ListViewState
    const moved = withListAddress(view, { status: "done", project: "all", title: "", ...display, collapsedGroups: ["status:done"], shownCounts: { "status:open": 50 } })
    expect(moved).toMatchObject({ status: "done", ordering: "oldest", collapsedGroups: ["status:done"], shownCounts: { "status:open": 50 }, savedView: "v1" })
  })
})

function initialLike(): ListViewState {
  return { status: "all", project: "all", title: "", columnVisibility: {}, localFilters: [], ...LIST_DISPLAY_DEFAULTS, collapsedGroups: [], shownCounts: {} }
}
