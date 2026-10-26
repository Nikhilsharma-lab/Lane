import { describe, expect, it } from "vitest"
import { periodLabel } from "@/lib/impact-period"
import { parsePeriodKey, periodChoices, periodKey, periodOfKind } from "./period-picker"

// The Outcome report's period picker (#208): a month, a quarter or a year, read from and written to the URL.

const NOW = new Date("2026-10-23T12:00:00.000Z")

describe("Outcome report period picker", () => {
  it("offers the months, quarters or years up to now, newest first", () => {
    expect(periodChoices("year", NOW).map(choice => choice.key)).toEqual(["2026", "2025", "2024"])
    expect(periodChoices("quarter", NOW).map(choice => choice.key)).toEqual(["2026-q4", "2026-q3", "2026-q2", "2026-q1", "2025-q4", "2025-q3", "2025-q2", "2025-q1"])
    const months = periodChoices("month", NOW).map(choice => choice.key)
    expect(months).toHaveLength(24)
    expect(months.slice(0, 3)).toEqual(["2026-10", "2026-09", "2026-08"])
    expect(months.at(-1)).toBe("2024-11")
    expect(periodChoices("month", NOW)[0].label).toBe("October 2026")
  })

  it("keeps the time in view when the kind changes, never moving past now", () => {
    expect(periodOfKind("quarter", { kind: "month", year: 2026, month: 8 }, NOW)).toEqual({ kind: "quarter", year: 2026, quarter: 3 })
    expect(periodOfKind("year", { kind: "quarter", year: 2025, quarter: 2 }, NOW)).toEqual({ kind: "year", year: 2025 })
    expect(periodOfKind("month", { kind: "year", year: 2025 }, NOW)).toEqual({ kind: "month", year: 2025, month: 12 })
    expect(periodOfKind("month", { kind: "year", year: 2026 }, NOW)).toEqual({ kind: "month", year: 2026, month: 10 })
    expect(periodOfKind("quarter", { kind: "year", year: 2026 }, NOW)).toEqual({ kind: "quarter", year: 2026, quarter: 4 })
  })

  it("reads a key back into the period the read model takes, and anything else as no choice", () => {
    expect(parsePeriodKey("2026-q3")).toEqual({ kind: "quarter", year: 2026, quarter: 3 })
    expect(parsePeriodKey("2026-07")).toEqual({ kind: "month", year: 2026, month: 7 })
    expect(parsePeriodKey("2025")).toEqual({ kind: "year", year: 2025 })
    expect(parsePeriodKey("all")).toBeNull()
    expect(parsePeriodKey(undefined)).toBeNull()
    expect(parsePeriodKey("2026-q5")).toBeNull()
    expect(parsePeriodKey("2026-13")).toBeNull()
    expect(parsePeriodKey("last-week")).toBeNull()
  })

  it("writes a period as the key the picker uses, and labels it in plain words", () => {
    expect(periodKey({ kind: "quarter", year: 2026, quarter: 4 })).toBe("2026-q4")
    expect(periodKey({ kind: "year", year: 2026 })).toBe("2026")
    expect(periodKey({ kind: "month", year: 2026, month: 3 })).toBe("2026-03")
    expect(periodLabel({ kind: "quarter", year: 2026, quarter: 4 })).toBe("Q4 2026")
    expect(periodLabel({ kind: "year", year: 2026 })).toBe("2026")
    expect(periodLabel({ kind: "month", year: 2026, month: 3 })).toBe("March 2026")
  })
})
