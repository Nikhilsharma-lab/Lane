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

import { RequestListViewProvider, planListUrlSync, useRequestListContext, useRequestListView, useSetRequestListView, withListContext, type ListViewState } from "./list-view-state"

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

describe("Request list context (plan item 1.7)", () => {
  const view = { status: "all", project: "all", pagination: { pageIndex: 3, pageSize: 25 } } as ListViewState

  it("returns to the first page on a new status view or Project and keeps the view otherwise", () => {
    expect(withListContext(view, { project: "none" })).toMatchObject({ status: "all", project: "none", pagination: { pageIndex: 0, pageSize: 25 } })
    expect(withListContext(view, { status: "all", project: "all" })).toBe(view)
  })

  const base = { seen: "", written: null, current: { status: "all", project: "all" } as const, hold: false, pathname: "/", locationSearch: "" }

  it("adopts a status view or Project that arrives in the URL", () => {
    expect(planListUrlSync({ ...base, search: "project=none", seen: null, locationSearch: "?project=none" })).toEqual({ seen: "project=none", adopt: { status: "all", project: "none" } })
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
