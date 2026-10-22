import { describe, expect, it } from "vitest"
import { filtersHiding, groupRequestRows, matchesListFilters, sortRequestRows, paginateRequests, type ListFilters, type OverviewRequest } from "./request-overview"
import type { ReleaseState } from "./request-release"

describe("The journey in the list (#133)", () => {
  const now = new Date("2026-10-28T12:00:00Z")
  const release = (dueDate: string): ReleaseState => ({ version: 1, ownerId: "maya", history: [], release: { exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" } })
  const base = { reframedProblem: null, createdAt: "2026-09-28T10:00:00Z", creatorName: null, assigneeName: null }
  const journey: OverviewRequest[] = [
    { ...base, id: "open", title: "Open", status: "open" },
    { ...base, id: "building", title: "In progress", status: "in_progress" },
    { ...base, id: "gave-up", title: "Closed at In progress", status: "in_progress", exceptionClosure: { kind: "exception" } },
    { ...base, id: "done", title: "Done", status: "done" },
    { ...base, id: "later", title: "Due in 10 days", status: "done", releaseState: release("2026-11-07") },
    { ...base, id: "soon", title: "Due in 3 days", status: "done", releaseState: release("2026-10-31") },
    { ...base, id: "today", title: "Due today", status: "done", releaseState: release("2026-10-28") },
    { ...base, id: "late", title: "Overdue", status: "done", releaseState: release("2026-10-20") },
    { ...base, id: "closed", title: "Closed", status: "done", releaseState: release("2026-10-20"), outcomeClosure: { kind: "measured" } },
  ]
  const all: ListFilters = { status: "all", project: "all", title: "", requestType: "" }
  const shown = (status: ListFilters["status"]) => journey.filter(row => matchesListFilters(row, { ...all, status }, now)).map(row => row.id)

  it("filters by each of the five statuses and by due soon or overdue", () => {
    expect(shown("open")).toEqual(["open"])
    expect(shown("in_progress")).toEqual(["building"])
    expect(shown("done")).toEqual(["done"])
    expect(shown("measuring")).toEqual(["later", "soon", "today", "late"])
    expect(shown("closed")).toEqual(["gave-up", "closed"])
    expect(shown("due")).toEqual(["soon", "today", "late"])
    expect(shown("all")).toHaveLength(journey.length)
  })

  it("groups the board into a column per journey status, in journey order", () => {
    const groups = groupRequestRows([...journey].reverse(), "status")
    expect(groups.map(group => group.label)).toEqual(["Open", "In progress", "Done", "Measuring", "Closed"])
    expect(groups.find(group => group.label === "Closed")!.rows.map(row => row.id).sort()).toEqual(["closed", "gave-up"])
    expect(sortRequestRows([...journey].reverse(), "status").map(row => row.id).slice(0, 4)).toEqual(["open", "building", "done", "late"])
  })

  it("keeps a column for every journey status, empty ones included", () => {
    const groups = groupRequestRows([journey[0]], "status")
    expect(groups.map(group => [group.key, group.label, group.rows.length])).toEqual([
      ["status:open", "Open", 1], ["status:in_progress", "In progress", 0], ["status:done", "Done", 0], ["status:measuring", "Measuring", 0], ["status:closed", "Closed", 0],
    ])
    expect(groupRequestRows([], "status")).toHaveLength(5)
  })
})

const requests: OverviewRequest[] = [
  { id: "a", title: "Progress bar", reframedProblem: "Signup is confusing", status: "open", createdAt: "2026-09-28T10:00:00Z", creatorName: "Maya", assigneeName: null },
  { id: "b", title: "Pricing clarity", reframedProblem: null, status: "in_progress", createdAt: "2026-09-29T10:00:00Z", creatorName: "Alex", assigneeName: "Priya" },
  { id: "c", title: "Account recovery", reframedProblem: null, status: "done", createdAt: "2026-09-27T10:00:00Z", creatorName: null, assigneeName: null },
]

describe("Requests overview sorting", () => {
  it("orders newest and oldest by submission without mutating input", () => {
    expect(sortRequestRows(requests, "newest").map(r => r.id)).toEqual(["b", "a", "c"])
    expect(sortRequestRows(requests, "oldest").map(r => r.id)).toEqual(["c", "a", "b"])
    expect(requests.map(r => r.id)).toEqual(["a", "b", "c"])
  })
  it("sorts by the displayed problem rather than the original suggestion", () => {
    expect(sortRequestRows(requests, "title").map(r => r.id)).toEqual(["c", "b", "a"])
  })
  it("handles an empty dataset", () => {
    expect(sortRequestRows([], "newest")).toEqual([])
  })
})

it("clamps pagination after filtering and preserves all requests across pages", () => {
  const items = Array.from({ length: 18 }, (_, id) => id)
  expect(paginateRequests(items, 0, 10).rows).toEqual(items.slice(0, 10))
  expect(paginateRequests(items, 1, 10).rows).toEqual(items.slice(10))
  expect(paginateRequests(items.slice(0, 2), 1, 10).pageIndex).toBe(0)
  expect(paginateRequests([], 5, 10)).toEqual({ rows: [], pageIndex: 0, pageCount: 1 })
})

describe("Request row grouping and order", () => {
  it("keeps assignees with the same display name in separate identity groups", () => {
    const rows = [
      { ...requests[0], assignedTo: "person-a", assigneeName: "Sam" },
      { ...requests[1], assignedTo: "person-b", assigneeName: "Sam" },
      { ...requests[2], assignedTo: null, assigneeName: null },
    ]
    expect(groupRequestRows(rows, "assignee").map(group => [group.key, group.label, group.rows.map(row => row.id)])).toEqual([
      ["assignee:person-a", "Sam", ["a"]], ["assignee:person-b", "Sam", ["b"]], ["assignee:none", "Unassigned", ["c"]],
    ])
  })
  it("groups Projects by ID and keeps No Project explicit", () => {
    expect(groupRequestRows([
      { ...requests[0], projectId: "website", projectName: "Website" },
      { ...requests[1], projectId: "other-website", projectName: "Website" },
      { ...requests[2], projectId: null, projectName: null },
    ], "project").map(group => [group.key, group.label, group.rows.length])).toEqual([
      ["project:other-website", "Website", 1], ["project:website", "Website", 1], ["project:none", "No Project", 1],
    ])
  })
  it("uses lifecycle order for Status and deterministic ID ties for titles and dates", () => {
    expect(sortRequestRows([requests[2], requests[1], requests[0]], "status").map(row => row.id)).toEqual(["a", "b", "c"])
    const tied = [{ ...requests[0], id: "z" }, { ...requests[0], id: "a" }]
    expect(sortRequestRows(tied, "newest").map(row => row.id)).toEqual(["a", "z"])
    expect(sortRequestRows(tied, "title_desc").map(row => row.id)).toEqual(["a", "z"])
    expect(groupRequestRows([requests[2], requests[0], requests[1]], "status").map(group => group.label)).toEqual(["Open", "In progress", "Done", "Measuring", "Closed"])
  })
  it("keeps every grouped Request across page boundaries and preserves the input", () => {
    const rows = [requests[2], requests[0], requests[1], { ...requests[0], id: "d" }]
    const groups = groupRequestRows(sortRequestRows(rows, "title"), "status")
    const ordered = groups.flatMap(group => group.rows)
    expect(paginateRequests(ordered, 0, 2).rows.map(row => row.id)).toEqual(["a", "d"])
    expect(paginateRequests(ordered, 1, 2).rows.map(row => row.id)).toEqual(["b", "c"])
    expect(groups[0].rows).toHaveLength(2)
    expect(rows.map(row => row.id)).toEqual(["c", "a", "b", "d"])
  })
})

describe("List filters for the list and the composer (plan item 2.3)", () => {
  const all: ListFilters = { status: "all", project: "all", title: "", requestType: "" }
  const created: OverviewRequest = { id: "new", title: "Checkout drops at the phone step", reframedProblem: null, status: "open", createdAt: "2026-10-11T10:00:00Z", creatorName: null, assigneeName: null, projectId: "p1", requestType: "bug" }

  it("hides nothing under the default view", () => {
    expect(filtersHiding(created, all)).toEqual([])
    expect(matchesListFilters(created, { ...all, project: "" })).toBe(true)
  })

  it("names each filter that leaves the row out", () => {
    expect(filtersHiding(created, { status: "done", project: "p2", title: "pricing", requestType: "feature" })).toEqual(["status", "project", "title", "requestType"])
    expect(filtersHiding({ ...created, projectId: null, requestType: null }, { ...all, project: "none", requestType: "none" })).toEqual([])
    expect(filtersHiding({ ...created, projectId: null }, { ...all, project: "p1" })).toEqual(["project"])
  })

  it("matches the title text the way the list does: trimmed, case-insensitive, on the reframed problem when there is one", () => {
    expect(matchesListFilters(created, { ...all, title: "  PHONE " })).toBe(true)
    expect(matchesListFilters({ ...created, reframedProblem: "Customers abandon signup" }, { ...all, title: "phone" })).toBe(false)
  })

  it("selects by status view and by the displayed title, as the list does", () => {
    const expected = {
      all: { "": ["a", "b", "c"], signup: ["a"], PRICING: ["b"] },
      open: { "": ["a"], signup: ["a"], PRICING: [] },
      in_progress: { "": ["b"], signup: [], PRICING: ["b"] },
      done: { "": ["c"], signup: [], PRICING: [] },
    } as const
    for (const status of ["all", "open", "in_progress", "done"] as const) {
      for (const title of ["", "signup", "PRICING"] as const) {
        const listed = requests.filter(row => matchesListFilters(row, { ...all, status, title })).map(row => row.id).sort()
        expect(listed).toEqual(expected[status][title])
      }
    }
  })
})
