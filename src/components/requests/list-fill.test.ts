import { describe, expect, it } from "vitest"
import type { OverviewRequest } from "@/lib/request-overview"
import type { ListViewState } from "./list-view-state"
import { listViewModel } from "./list-view-model"
import { readToFill } from "./list-fill"

const view: ListViewState = { title: "", columnVisibility: {}, localFilters: [], ordering: "newest", grouping: "status", collapsedGroups: [], shownCounts: {}, status: "all", project: "all" }
const many = (prefix: string, count: number, status: OverviewRequest["status"], extra: Partial<OverviewRequest> = {}) =>
  Array.from({ length: count }, (_, index): OverviewRequest => ({ id: `${prefix}${String(index).padStart(2, "0")}`, title: prefix, reframedProblem: null, status, createdAt: new Date(Date.UTC(2026, 9, 1, 0, count - index)).toISOString(), creatorName: null, assigneeName: null, ...extra }))
const idle = { pending: null, error: null }
const fill = (next: ListViewState, rows: OverviewRequest[], server = { finishedCounts: { done: 120, measuring: 0, closed: 0 }, olderMore: { all: true, done: true } }, older: Parameters<typeof readToFill>[2] = idle) =>
  readToFill(listViewModel(next, rows, server).groups, next.shownCounts, older)

describe("filling a group up to the count it should show (A212, #275)", () => {
  const loaded = [...many("o", 3, "open"), ...many("d", 50, "done")]

  it("reads a finished group's older Requests after a reload asked for more than the first load holds", () => {
    expect(fill({ ...view, shownCounts: { "status:done": 100 } }, loaded)).toBe("done")
  })
  it("reads nothing once the group holds what it should show, or when nothing asked for more", () => {
    expect(fill({ ...view, shownCounts: { "status:done": 50 } }, loaded)).toBeNull()
    expect(fill(view, loaded)).toBeNull()
    // The server has no older Done: the group shows what there is.
    expect(fill({ ...view, shownCounts: { "status:done": 100 } }, loaded, { finishedCounts: { done: 50, measuring: 0, closed: 0 }, olderMore: { all: true, done: false } })).toBeNull()
  })
  it("reads one page at a time, and leaves a failed read to Show more", () => {
    const asked = { ...view, shownCounts: { "status:done": 100 } }
    expect(fill(asked, loaded, undefined, { pending: "done", error: null })).toBeNull()
    expect(fill(asked, loaded, undefined, { pending: null, error: { read: "done", message: "Older Requests couldn’t be loaded. Try again." } })).toBeNull()
  })
  it("reads on for a Project group whose last read added none of its Requests, so its Show more never does nothing", () => {
    const projectRows = many("p", 25, "done", { projectId: "p1", projectName: "Checkout" })
    // Show more asked for 50; the page that came back held only other Projects' Requests.
    expect(fill({ ...view, grouping: "project", shownCounts: { "project:p1": 50 } }, [...projectRows, ...many("x", 50, "done")])).toBe("all")
  })
})
