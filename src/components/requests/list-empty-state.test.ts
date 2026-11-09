import { describe, expect, it } from "vitest"
import { addedFilters, hasAddedFilters } from "./added-filters"
import { listEmptyLine } from "./list-empty-state"

const view = (patch: Partial<Parameters<typeof listEmptyLine>[0]> = {}) => ({ status: "all" as const, project: "all", title: "", requestType: "", ...patch })
const person = { workspaceEmpty: false, readOnly: false }

describe("the list's empty line (#240 decision 8)", () => {
  it("shows the welcome while the workspace has no Requests, whatever the view", () => {
    expect(listEmptyLine(view({ status: "done", title: "checkout" }), { ...person, workspaceEmpty: true })).toEqual({ kind: "welcome" })
  })

  it.each([
    ["open", "Nothing is Open", "New Requests start here."],
    ["in_progress", "Nothing is In progress", "Requests move here when someone picks them up."],
    ["done", "Nothing is Done", "Requests move here when the work is finished."],
    ["measuring", "Nothing is Measuring", "Requests move here once their work is released."],
    ["closed", "Nothing is Closed yet", "Requests close when the result is recorded."],
    ["due", "No results are due soon", ""],
    ["waiting", "No Guest submissions are waiting", ""],
  ] as const)("gives the %s pill its own line, with no Clear filters", (status, title, description) => {
    const line = listEmptyLine(view({ status }), person)
    expect(line).toMatchObject({ kind: "status", title, description, clearFilters: false })
  })

  it("offers New Request only on Open's line, and never to a Viewer", () => {
    expect(listEmptyLine(view({ status: "open" }), person)).toMatchObject({ newRequest: true })
    expect(listEmptyLine(view({ status: "open" }), { ...person, readOnly: true })).toMatchObject({ newRequest: false })
    for (const status of ["in_progress", "done", "measuring", "closed", "due", "waiting"] as const)
      expect(listEmptyLine(view({ status }), person)).toMatchObject({ newRequest: false })
  })

  it("keeps the pill's line on a Project page", () => {
    expect(listEmptyLine(view({ status: "done", project: "project-1" }), person)).toMatchObject({ kind: "status", title: "Nothing is Done" })
    expect(listEmptyLine(view({ status: "measuring", project: "none" }), person)).toMatchObject({ kind: "status", title: "Nothing is Measuring" })
  })

  it("says no Requests match, with Clear filters, once a filter was added", () => {
    const filtered = { kind: "filtered", title: "No matching Requests", description: "Change or clear your filters.", clearFilters: true, newRequest: false }
    expect(listEmptyLine(view({ title: "checkout" }), person)).toEqual(filtered)
    expect(listEmptyLine(view({ requestType: "label-1" }), person)).toEqual(filtered)
    expect(listEmptyLine(view({ project: "project-1", projectAdded: true }), person)).toEqual(filtered)
    expect(listEmptyLine(view({ status: "open", title: "checkout", project: "project-1" }), person)).toEqual(filtered)
  })

  it("names an empty Project page, or an empty list, without Clear filters", () => {
    expect(listEmptyLine(view({ project: "project-1" }), person)).toMatchObject({ kind: "empty", title: "No Requests in this Project yet", clearFilters: false })
    expect(listEmptyLine(view({ project: "none" }), person)).toMatchObject({ kind: "empty", title: "No Requests without a Project", clearFilters: false })
    expect(listEmptyLine(view(), person)).toMatchObject({ kind: "empty", title: "No Requests yet", clearFilters: false })
  })
})

describe("added filters (A215)", () => {
  it("counts only the title and label filters, never a status pill or the page's Project", () => {
    expect(hasAddedFilters(view({ status: "done", project: "project-1" }))).toBe(false)
    expect(hasAddedFilters(view({ title: "  " }))).toBe(false)
    expect(hasAddedFilters(view({ title: "checkout" }))).toBe(true)
    expect(hasAddedFilters(view({ requestType: "none" }))).toBe(true)
  })
  it("counts a Project added from Add filter on the whole list, in the chips' order", () => {
    expect(addedFilters(view({ project: "project-1" }))).toEqual([])
    expect(addedFilters(view({ project: "project-1", projectAdded: true, title: "checkout", requestType: "none" }))).toEqual(["title", "project", "requestType"])
  })
})
