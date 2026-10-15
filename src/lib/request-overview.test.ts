import { describe, expect, it } from "vitest"
import { filtersHiding, groupRequestRows, matchesListFilters, sortRequestRows, paginateRequests, type ListFilters, type OverviewRequest } from "./request-overview"

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
    expect(groupRequestRows([requests[2], requests[0], requests[1]], "status").map(group => group.label)).toEqual(["Open", "In Progress", "Done"])
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
