import { describe, expect, it } from "vitest"
import type { OverviewRequest } from "@/lib/request-overview"
import type { ListViewState } from "./list-view-state"
import { listViewModel, viewResets } from "./list-view-model"

const view: ListViewState = {
  columnVisibility: {}, localFilters: [], ordering: "newest", grouping: "status", collapsedGroups: [],
  pagination: { pageIndex: 0, pageSize: 2 }, status: "all", project: "all",
}
const row = (id: string, status: OverviewRequest["status"], createdAt: string, title = id): OverviewRequest =>
  ({ id, title, reframedProblem: null, status, createdAt, creatorName: null, assigneeName: null })
const rows = [row("a", "open", "2026-10-01"), row("b", "in_progress", "2026-10-03"), row("c", "open", "2026-10-02", "Checkout"), row("d", "done", "2026-10-04")]

describe("listViewModel", () => {
  it("filters, sorts, groups and pages the rows in one place", () => {
    const model = listViewModel({ ...view, localFilters: [{ id: "title", value: "check" }] }, rows)
    expect(model.filters).toEqual({ status: "all", project: "all", title: "check", requestType: "" })
    expect(model.matching.map(r => r.id)).toEqual(["c"])
  })
  it("pages the grouped order and leaves collapsed groups out of what is visible", () => {
    const model = listViewModel(view, rows)
    expect(model.groups.map(g => g.key)).toEqual(["status:open", "status:in_progress", "status:done", "status:measuring", "status:closed"])
    expect(model.page).toMatchObject({ pageIndex: 0, pageCount: 2 })
    expect(model.page.rows.map(r => r.id)).toEqual(["c", "a"])
    expect(listViewModel({ ...view, collapsedGroups: ["status:open"] }, rows).visibleRows.map(r => r.id)).toEqual([])
    expect(listViewModel({ ...view, grouping: "none" }, rows).visibleRows.map(r => r.id)).toEqual(["d", "b"])
  })
})

describe("the board's columns", () => {
  it("shows all five statuses in journey order with every status, empty ones included", () => {
    expect(listViewModel(view, rows).groups.map(g => [g.label, g.rows.length])).toEqual([["Open", 2], ["In progress", 1], ["Done", 1], ["Measuring", 0], ["Closed", 0]])
  })
  it("shows only the matching column once a status view is chosen", () => {
    expect(listViewModel({ ...view, status: "open" }, rows).groups.map(g => g.label)).toEqual(["Open"])
    expect(listViewModel({ ...view, status: "measuring" }, rows).groups).toEqual([])
  })
})

describe("viewResets", () => {
  const keys = (next: ListViewState) => [viewResets.selection(next, { isGuest: false }), viewResets.preview(next), viewResets.announcement(next)]
  const same = (next: ListViewState) => keys(next).map((key, index) => key === keys(view)[index])
  it("resets nothing for column visibility or a reveal", () => {
    expect(same({ ...view, columnVisibility: { assignee: false }, reveal: "a" })).toEqual([true, true, true])
  })
  it("drops the selection and rechecks the preview on a page change, without announcing a count", () => {
    expect(same({ ...view, pagination: { pageIndex: 1, pageSize: 2 } })).toEqual([false, false, true])
  })
  it("collapsing a group drops only the selection", () => {
    expect(same({ ...view, collapsedGroups: ["status:done"] })).toEqual([false, true, true])
  })
  it("a filter change resets all three", () => {
    expect(same({ ...view, status: "open" })).toEqual([false, false, false])
  })
})
