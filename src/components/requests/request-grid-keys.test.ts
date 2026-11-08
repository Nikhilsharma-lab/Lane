import { describe, expect, it } from "vitest"
import { gridCommand, gridKeysFor, headerOf, listCommand, nextKey, tabbableKey } from "./request-grid-keys"

describe("gridCommand", () => {
  it("maps the list keys", () => {
    expect(["j", "ArrowDown", "k", "ArrowUp", "Home", "End", "ArrowRight", "ArrowLeft", "Enter", "x", "f"].map(key => gridCommand({ key })))
      .toEqual(["next-request", "next", "previous-request", "previous", "first", "last", "expand", "collapse", "activate", "select", "filter"])
    expect(gridCommand({ key: "J", shiftKey: false })).toBe("next-request")
  })
  it("ignores modifiers, Shift letters, typing and composition", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) expect(gridCommand({ key: "j", [modifier]: true })).toBeNull()
    expect(gridCommand({ key: "J", shiftKey: true })).toBeNull()
    expect(gridCommand({ key: "X", shiftKey: true })).toBeNull()
    expect(gridCommand({ key: "ArrowDown", shiftKey: true })).toBeNull()
    expect(gridCommand({ key: "j" }, true)).toBeNull()
    expect(gridCommand({ key: "j", isComposing: true })).toBeNull()
    expect(gridCommand({ key: "j", defaultPrevented: true })).toBeNull()
  })
  it("lets only moves repeat", () => {
    expect(gridCommand({ key: "j", repeat: true })).toBe("next-request")
    expect(gridCommand({ key: "k", repeat: true })).toBe("previous-request")
    expect(gridCommand({ key: "ArrowUp", repeat: true })).toBe("previous")
    for (const key of ["x", "Enter", "f", "Home", "ArrowRight"]) expect(gridCommand({ key, repeat: true })).toBeNull()
  })
  it("leaves the app-wide keys alone", () => {
    for (const key of ["c", "/", "?", "["]) {
      expect(gridCommand({ key, shiftKey: key === "?" })).toBeNull()
      expect(listCommand({ key, shiftKey: key === "?" })).toBeNull()
    }
  })
  // Plan item 2.12: Space previews the focused row (as workspace search's Space opens its preview); never repeated, chorded or outside the grid.
  it("previews with Space on a row only", () => {
    expect(gridCommand({ key: " " })).toBe("peek")
    expect(gridCommand({ key: " ", repeat: true })).toBeNull()
    expect(gridCommand({ key: " ", shiftKey: true })).toBeNull()
    expect(gridCommand({ key: " " }, true)).toBeNull()
    expect(listCommand({ key: " " })).toBeNull()
  })
})

describe("listCommand", () => {
  it("brings J and K back to the grid and opens the filter with F", () => {
    expect(listCommand({ key: "j" })).toBe("focus-next")
    expect(listCommand({ key: "k" })).toBe("focus-previous")
    expect(listCommand({ key: "f" })).toBe("filter")
    expect(listCommand({ key: "ArrowDown" })).toBeNull()
    expect(listCommand({ key: "f", repeat: true })).toBeNull()
    expect(listCommand({ key: "j" }, true)).toBeNull()
  })
})

const keys = ["g:status:open", "r:a", "r:b", "m:status:open", "g:status:in_progress", "r:c"]

describe("nextKey", () => {
  it("stops ↑ and ↓ on every row: headers, Requests and Show more", () => {
    expect(nextKey(keys, "g:status:open", "next")).toEqual({ key: "r:a" })
    expect(nextKey(keys, "r:b", "next")).toEqual({ key: "m:status:open" })
    expect(nextKey(keys, "m:status:open", "next")).toEqual({ key: "g:status:in_progress" })
    expect(nextKey(keys, "r:a", "previous")).toEqual({ key: "g:status:open" })
    expect(nextKey(keys, "r:b", "first")).toEqual({ key: "g:status:open" })
    expect(nextKey(keys, "r:a", "last")).toEqual({ key: "r:c" })
  })
  it("moves J and K from Request to Request, past headers and Show more (#240 decision 5)", () => {
    expect(nextKey(keys, "r:b", "next-request")).toEqual({ key: "r:c" })
    expect(nextKey(keys, "r:c", "previous-request")).toEqual({ key: "r:b" })
    expect(nextKey(keys, "g:status:open", "next-request")).toEqual({ key: "r:a" })
    expect(nextKey(keys, "m:status:open", "previous-request")).toEqual({ key: "r:b" })
    expect(nextKey(["g:status:open", "g:status:done"], "g:status:open", "next-request")).toBeNull()
  })
  it("has no page edges: the ends of the list stay put", () => {
    expect(nextKey(keys, "r:c", "next")).toBeNull()
    expect(nextKey(keys, "r:c", "next-request")).toBeNull()
    expect(nextKey(keys, "g:status:open", "previous")).toBeNull()
    expect(nextKey(keys, "r:a", "previous-request")).toBeNull()
    expect(nextKey([], "r:a", "next")).toBeNull()
  })
  it("finds a row's group header", () => {
    expect(headerOf(keys, "r:c")).toBe("g:status:in_progress")
    expect(headerOf(keys, "r:b")).toBe("g:status:open")
    expect(headerOf(keys, "m:status:open")).toBe("g:status:open")
    expect(headerOf(["r:a"], "r:a")).toBeNull()
  })
})

describe("tabbableKey", () => {
  it("keeps the active row while it is shown", () => {
    expect(tabbableKey(keys, { key: "r:b", index: 2 })).toBe("r:b")
  })
  it("falls back to the row that took its place, by index", () => {
    expect(tabbableKey(["g:status:open", "r:a", "r:c"], { key: "r:b", index: 2 })).toBe("r:c")
    expect(tabbableKey(["r:a"], { key: "r:z", index: 9 })).toBe("r:a")
    expect(tabbableKey(keys, null)).toBe("g:status:open")
    expect(tabbableKey([], null)).toBeNull()
  })
})

describe("gridKeysFor", () => {
  const groups = [{ key: "status:open", rows: [{ id: "a" }, { id: "b" }], more: true }, { key: "status:done", rows: [{ id: "c" }], more: false }]
  it("lists each group's header, its shown rows and its Show more, skipping folded groups' rows", () => {
    expect(gridKeysFor(groups, { headers: true, collapsedGroups: [] })).toEqual(["g:status:open", "r:a", "r:b", "m:status:open", "g:status:done", "r:c"])
    expect(gridKeysFor(groups, { headers: true, collapsedGroups: ["status:open"] })).toEqual(["g:status:open", "g:status:done", "r:c"])
  })
  it("keeps a header whose Requests are all still on the server, so its Show more can be reached", () => {
    expect(gridKeysFor([{ key: "status:closed", rows: [], more: true }], { headers: true, collapsedGroups: [] })).toEqual(["g:status:closed", "m:status:closed"])
  })
  it("gives an ungrouped list its rows and one Show more at the bottom", () => {
    expect(gridKeysFor([{ key: "all", rows: [{ id: "b" }, { id: "a" }], more: true }], { headers: false, collapsedGroups: ["all"] })).toEqual(["r:b", "r:a", "m:all"])
  })
})
