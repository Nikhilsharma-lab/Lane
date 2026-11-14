import { describe, expect, it } from "vitest"
import { impactHref, readImpactAddress, tabToOpen } from "./impact-href"

// #283: Impact's address holds the open tab, the period and the person shown, and the page reads all three back.

describe("impactHref: Impact's own address", () => {
  it("is the bare route when nothing is chosen", () => {
    expect(impactHref({})).toBe("/impact")
    expect(impactHref({ tab: null, period: null, person: null })).toBe("/impact")
  })

  it("carries the tab, a chosen quarter, year or month, and a person in the query", () => {
    expect(impactHref({ tab: "outcome-report" })).toBe("/impact?tab=outcome-report")
    expect(impactHref({ tab: "my-work", person: "user_x" })).toBe("/impact?tab=my-work&person=user_x")
    expect(impactHref({ period: { kind: "quarter", year: 2026, quarter: 3 } })).toBe("/impact?period=2026-q3")
    expect(impactHref({ tab: "outcome-report", period: { kind: "year", year: 2026 }, person: "user_x" })).toBe("/impact?tab=outcome-report&period=2026&person=user_x")
    expect(impactHref({ period: { kind: "month", year: 2026, month: 2 } })).toBe("/impact?period=2026-02")
  })

  it("escapes a person id so it can't add to the query", () => {
    expect(impactHref({ person: "user_x&tab=my-work" })).toBe("/impact?person=user_x%26tab%3Dmy-work")
  })
})

describe("readImpactAddress: the page's reading of its query", () => {
  it("reads back what impactHref wrote", () => {
    expect(readImpactAddress({ tab: "outcome-report", period: "2026-q3", person: "user_x" })).toEqual({
      tab: "outcome-report", period: { kind: "quarter", year: 2026, quarter: 3 }, person: "user_x",
    })
    expect(readImpactAddress({ tab: "my-work", period: "2025" })).toEqual({ tab: "my-work", period: { kind: "year", year: 2025 }, person: null })
  })

  it("reads nothing chosen from an empty query", () => {
    expect(readImpactAddress({})).toEqual({ tab: null, period: null, person: null })
  })

  it("drops a tab, period or person it doesn't recognise, and a value given twice", () => {
    expect(readImpactAddress({ tab: "teammates", period: "2026-q5", person: "" })).toEqual({ tab: null, period: null, person: null })
    expect(readImpactAddress({ tab: ["my-work", "outcome-report"], period: ["2026", "2025"], person: ["user_a", "user_b"] })).toEqual({ tab: null, period: null, person: null })
  })

  it("no longer opens the Outcome report just because a period is named", () => {
    expect(readImpactAddress({ period: "2026-q4" }).tab).toBeNull()
  })
})

describe("tabToOpen: which tab Impact opens on", () => {
  it("opens the tab the address names, for anyone", () => {
    expect(tabToOpen("outcome-report", { canFile: true })).toBe("outcome-report")
    expect(tabToOpen("my-work", { canFile: false })).toBe("my-work")
  })

  it("opens My work for someone who can file, and the Outcome report for someone who can't (Nikhil, 2026-11-09)", () => {
    expect(tabToOpen(null, { canFile: true })).toBe("my-work")
    expect(tabToOpen(null, { canFile: false })).toBe("outcome-report")
  })
})
