import { describe, expect, it } from "vitest"
import { filterRoster, mergeOptions, normalizeQuery, pickerStatus } from "./reviewer-search"

// Plan item 2.6: the reviewer picker's pure helpers.
const sam = { id: "sam", name: "Sam Lee" }, taylor = { id: "taylor", name: "Taylor Chen" }, samir = { id: "samir", name: "Samir Osei" }
const roster = [sam, taylor, samir]

describe("reviewer search helpers", () => {
  it("normalises whitespace and case", () => {
    expect(normalizeQuery("  Sam   LEE ")).toBe("sam lee")
    expect(filterRoster(roster, "  sAm")).toEqual([sam, samir])
    expect(filterRoster(roster, "sam  lee")).toEqual([sam])
    expect(filterRoster(roster, "")).toBe(roster)
    expect(filterRoster(roster, "nobody")).toEqual([])
  })

  it("lists the selected people first and each person once", () => {
    expect(mergeOptions([taylor], [sam, taylor, samir])).toEqual([taylor, sam, samir])
    expect(mergeOptions([taylor, sam], [])).toEqual([taylor, sam])
    expect(mergeOptions([], [sam, sam])).toEqual([sam])
  })

  it("carries exactly one status line", () => {
    const base = { searching: false, error: null, full: false, limit: 10, narrow: false, local: true, normalized: "", matches: 3 }
    expect(pickerStatus(base)).toBeNull()
    expect(pickerStatus({ ...base, searching: true })).toBe("Finding teammates…")
    expect(pickerStatus({ ...base, error: "Down", matches: 0 })).toBeNull()
    expect(pickerStatus({ ...base, full: true })).toBe("10 of 10 selected. Remove one to add another.")
    expect(pickerStatus({ ...base, normalized: "sam", matches: 1 })).toBe("1 teammate matches")
    expect(pickerStatus({ ...base, normalized: "sa", matches: 2 })).toBe("2 teammates match")
    expect(pickerStatus({ ...base, normalized: "zed", matches: 0 })).toBe("No teammates match. Try another name.")
    expect(pickerStatus({ ...base, local: false, matches: 0 })).toBe("No teammates match. Try another name.")
    expect(pickerStatus({ ...base, local: false, narrow: true, matches: 0 })).toBe("Type a more specific name to find a teammate.")
  })
})
