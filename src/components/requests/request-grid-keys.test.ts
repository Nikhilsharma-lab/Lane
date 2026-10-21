import { describe, expect, it } from "vitest"
import { gridCommand, gridKeysFor, headerOf, listCommand, nextKey, tabbableKey } from "./request-grid-keys"

describe("gridCommand", () => {
  it("maps the list keys", () => {
    expect(["j", "ArrowDown", "k", "ArrowUp", "Home", "End", "ArrowRight", "ArrowLeft", "Enter", "x", "f"].map(key => gridCommand({ key })))
      .toEqual(["next", "next", "previous", "previous", "first", "last", "expand", "collapse", "activate", "select", "filter"])
    expect(gridCommand({ key: "J", shiftKey: false })).toBe("next")
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
    expect(gridCommand({ key: "j", repeat: true })).toBe("next")
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

const keys = ["g:status:open", "r:a", "r:b", "g:status:in_progress", "r:c"]

describe("nextKey", () => {
  it("walks headers and rows in page order", () => {
    expect(nextKey(keys, "g:status:open", "next")).toEqual({ key: "r:a" })
    expect(nextKey(keys, "r:b", "next")).toEqual({ key: "g:status:in_progress" })
    expect(nextKey(keys, "r:a", "previous")).toEqual({ key: "g:status:open" })
    expect(nextKey(keys, "r:b", "first")).toEqual({ key: "g:status:open" })
    expect(nextKey(keys, "r:a", "last")).toEqual({ key: "r:c" })
  })
  it("reports the page edges", () => {
    expect(nextKey(keys, "r:c", "next")).toEqual({ edge: "next-page" })
    expect(nextKey(keys, "g:status:open", "previous")).toEqual({ edge: "previous-page" })
    expect(nextKey([], "r:a", "next")).toBeNull()
  })
  it("finds a row's group header", () => {
    expect(headerOf(keys, "r:c")).toBe("g:status:in_progress")
    expect(headerOf(keys, "r:b")).toBe("g:status:open")
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
  const groups = [{ key: "status:open", rows: [{ id: "a" }, { id: "b" }] }, { key: "status:done", rows: [{ id: "c" }] }]
  it("lists headers and the page's rows, skipping collapsed rows and empty groups", () => {
    expect(gridKeysFor(groups, [{ id: "a" }, { id: "b" }, { id: "c" }], [])).toEqual(["g:status:open", "r:a", "r:b", "g:status:done", "r:c"])
    expect(gridKeysFor(groups, [{ id: "a" }, { id: "b" }, { id: "c" }], ["status:open"])).toEqual(["g:status:open", "g:status:done", "r:c"])
    expect(gridKeysFor(groups, [{ id: "c" }], [])).toEqual(["g:status:done", "r:c"])
    expect(gridKeysFor(null, [{ id: "b" }, { id: "a" }], [])).toEqual(["r:b", "r:a"])
  })
})
