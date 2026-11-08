import { describe, expect, it } from "vitest"
import type { OverviewRequest } from "@/lib/request-overview"
import type { ListViewState } from "./list-view-state"
import { listViewModel, showMore, viewResets, withRowShown } from "./list-view-model"

const view: ListViewState = { title: "",
  columnVisibility: {}, localFilters: [], ordering: "newest", grouping: "status", collapsedGroups: [],
  shownCounts: {}, status: "all", project: "all",
}
const row = (id: string, status: OverviewRequest["status"], createdAt: string, title = id): OverviewRequest =>
  ({ id, title, reframedProblem: null, status, createdAt, creatorName: null, assigneeName: null })
const rows = [row("a", "open", "2026-10-01"), row("b", "in_progress", "2026-10-03"), row("c", "open", "2026-10-02", "Checkout"), row("d", "done", "2026-10-04")]

const many = (prefix: string, count: number, status: OverviewRequest["status"], day = 1) =>
  Array.from({ length: count }, (_, index) => row(`${prefix}${String(index).padStart(2, "0")}`, status, new Date(Date.UTC(2026, 9, day, 0, count - index)).toISOString()))

describe("each group's shown rows (A212)", () => {
  it("shows a group's first 25, and a long group never pushes another group off the list", () => {
    const model = listViewModel(view, [...many("o", 30, "open", 2), ...many("p", 3, "in_progress")])
    expect(model.groups.map(group => [group.key, group.shown.length])).toEqual([["status:open", 25], ["status:in_progress", 3]])
    expect(model.groups[0].shown.map(r => r.id)).toEqual(many("o", 25, "open").map(r => r.id))
  })
  it("shows as many as that group's shown count, and only that group grows", () => {
    const loaded = [...many("o", 60, "open", 2), ...many("p", 30, "in_progress")]
    const model = listViewModel({ ...view, shownCounts: { "status:open": 50 } }, loaded)
    expect(model.groups.map(group => [group.key, group.shown.length, group.rows.length])).toEqual([["status:open", 50, 60], ["status:in_progress", 25, 30]])
  })
  it("gives Project and Assignee groups their own 25, and no grouping one group of 25", () => {
    const loaded = [...many("o", 30, "open", 2).map(r => ({ ...r, projectId: "p1", projectName: "Checkout" })), ...many("n", 27, "in_progress")]
    expect(listViewModel({ ...view, grouping: "project" }, loaded).groups.map(group => [group.label, group.shown.length])).toEqual([["Checkout", 25], ["No Project", 25]])
    const none = listViewModel({ ...view, grouping: "none", shownCounts: { all: 50 } }, loaded)
    expect(none.groups.map(group => [group.key, group.shown.length])).toEqual([["all", 50]])
    expect(none.visibleRows).toHaveLength(50)
    expect(listViewModel({ ...view, grouping: "none" }, loaded).visibleRows).toHaveLength(25)
  })
})

describe("full counts and Show more (A212)", () => {
  const counts = { done: 60, measuring: 0, closed: 4 }
  const loaded = [...many("o", 30, "open", 3), ...many("d", 50, "done", 2)]
  const group = (model: ReturnType<typeof listViewModel>, key: string) => model.groups.find(item => item.key === key)
  const summary = (model: ReturnType<typeof listViewModel>) => model.groups.map(item => [item.key, item.count, item.more, item.older])

  it("counts a finished group's Requests on the server, not only the latest ones loaded, and fetches older ones when its loaded rows run out", () => {
    const model = listViewModel(view, loaded, { finishedCounts: counts, olderMore: { all: true, done: true, closed: true } })
    expect(summary(model)).toEqual([["status:open", 30, true, null], ["status:done", 60, true, "done"], ["status:closed", 4, true, "closed"]])
    // Closed has no loaded rows yet: its header and Show more stand for the four on the server.
    expect(group(model, "status:closed")?.shown).toEqual([])
  })
  it("offers no Show more once a group shows everything, here and on the server", () => {
    const model = listViewModel({ ...view, shownCounts: { "status:open": 50, "status:done": 75 } }, loaded, { finishedCounts: { ...counts, done: 50, closed: 0 }, olderMore: { all: true, done: true } })
    expect(summary(model)).toEqual([["status:open", 30, false, null], ["status:done", 50, false, null]])
    expect(summary(listViewModel({ ...view, shownCounts: { "status:done": 50 } }, loaded, { finishedCounts: counts, olderMore: { all: true, done: false } }))[1]).toEqual(["status:done", 60, false, null])
  })
  it("counts what is loaded when a Project, title or label filter narrows the list", () => {
    const narrowed = listViewModel({ ...view, title: "d0" }, loaded, { finishedCounts: counts, olderMore: { all: true, done: true } })
    expect(summary(narrowed)).toEqual([["status:done", 10, true, "done"]])
  })
  it("pages a finished status view through its own read, and Due soon or overdue through its own", () => {
    const measuring = many("m", 3, "done").map(r => ({ ...r, releaseState: { version: 1, ownerId: "u", release: { exposureDate: "2026-10-01", audience: "All", evidence: "Log", dueDate: "2026-10-02", startDate: "2026-10-01", windowKind: "relative" }, history: [] } as unknown as OverviewRequest["releaseState"] }))
    expect(summary(listViewModel({ ...view, status: "due" }, measuring, { finishedCounts: { done: 0, measuring: 9, closed: 0 }, olderMore: { due: true } }))).toEqual([["status:measuring", 3, true, "due"]])
  })
  it("lets Project, Assignee and ungrouped lists count what is loaded and fetch older finished Requests for the status view", () => {
    const projects = listViewModel({ ...view, grouping: "project" }, loaded, { finishedCounts: counts, olderMore: { all: true } })
    expect(summary(projects)).toEqual([["project:none", 80, true, "all"]])
    expect(summary(listViewModel({ ...view, grouping: "none", status: "open" }, loaded, { finishedCounts: counts, olderMore: { all: true } }))).toEqual([["all", 30, true, null]])
  })
})

describe("Show more", () => {
  const loaded = [...many("o", 30, "open", 3), ...many("d", 50, "done", 2)]
  const server = { finishedCounts: { done: 60, measuring: 0, closed: 0 }, olderMore: { all: true, done: true } }
  const groupOf = (next: ListViewState, key: string) => listViewModel(next, loaded, server).groups.find(item => item.key === key)!

  it("adds 25 to that group alone, from loaded rows first", () => {
    const next = showMore(view, groupOf(view, "status:done"))
    expect(next).toEqual({ view: { ...view, shownCounts: { "status:done": 50 } }, read: null })
    expect(groupOf(next.view, "status:done").shown).toHaveLength(50)
    expect(groupOf(next.view, "status:open").shown).toHaveLength(25)
  })
  it("calls the group's older-finished read once its loaded rows run out", () => {
    const expanded = { ...view, shownCounts: { "status:done": 50 } }
    expect(showMore(expanded, groupOf(expanded, "status:done"))).toEqual({ view: { ...view, shownCounts: { "status:done": 75 } }, read: "done" })
    // An active group has nothing older to read.
    expect(showMore(view, groupOf(view, "status:open"))).toEqual({ view: { ...view, shownCounts: { "status:open": 50 } }, read: null })
  })
  it("grows from what the group shows, so a group with nothing loaded yet reads its first rows", () => {
    const closed = listViewModel(view, loaded, { finishedCounts: { done: 50, measuring: 0, closed: 4 }, olderMore: { all: true, closed: true } }).groups.find(item => item.key === "status:closed")!
    expect(showMore(view, closed)).toEqual({ view: { ...view, shownCounts: { "status:closed": 25 } }, read: "closed" })
  })
})

describe("bringing a Request back into view", () => {
  const loaded = many("o", 60, "open")
  it("grows its group's shown count by steps of 25 until the row shows, and unfolds the group", () => {
    const folded = { ...view, collapsedGroups: ["status:open", "status:done"] }
    const next = withRowShown(folded, listViewModel(folded, loaded).groups, "o30")
    expect(next).toMatchObject({ shownCounts: { "status:open": 50 }, collapsedGroups: ["status:done"] })
    expect(listViewModel(next, loaded).visibleRows.map(r => r.id)).toContain("o30")
  })
  it("keeps the same view when the row already shows, or is not in the list", () => {
    expect(withRowShown(view, listViewModel(view, loaded).groups, "o03")).toBe(view)
    expect(withRowShown(view, listViewModel(view, loaded).groups, "missing")).toBe(view)
  })
})

describe("listViewModel", () => {
  it("filters, sorts and groups the rows in one place", () => {
    const model = listViewModel({ ...view, title: "check" }, rows)
    expect(model.filters).toEqual({ status: "all", project: "all", title: "check", requestType: "" })
    expect(model.matching.map(r => r.id)).toEqual(["c"])
  })
  it("leaves collapsed groups out of what is visible", () => {
    expect(listViewModel(view, rows).visibleRows.map(r => r.id)).toEqual(["c", "a", "b", "d"])
    expect(listViewModel({ ...view, collapsedGroups: ["status:open"] }, rows).visibleRows.map(r => r.id)).toEqual(["b", "d"])
    expect(listViewModel({ ...view, grouping: "none" }, rows).visibleRows.map(r => r.id)).toEqual(["d", "b", "c", "a"])
  })
})

describe("the status groups", () => {
  it("are in journey order and leave empty statuses out, with every status shown too (A221)", () => {
    expect(listViewModel(view, rows).groups.map(g => [g.label, g.rows.length])).toEqual([["Open", 2], ["In progress", 1], ["Done", 1]])
  })
  it("show only the matching group once a status view is chosen", () => {
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
  it("keeps the selection on Show more and rechecks the preview against the shown rows, without announcing a count", () => {
    expect(same({ ...view, shownCounts: { "status:open": 50 } })).toEqual([true, false, true])
  })
  it("collapsing a group drops only the selection", () => {
    expect(same({ ...view, collapsedGroups: ["status:done"] })).toEqual([false, true, true])
  })
  it("a filter change resets all three", () => {
    expect(same({ ...view, status: "open" })).toEqual([false, false, false])
  })
})

it("changing to Viewer drops a retained selection even when its rows and filters stay the same", () => {
  expect(viewResets.selection(view, { isGuest: false, readOnly: true }))
    .not.toBe(viewResets.selection(view, { isGuest: false, readOnly: false }))
})
