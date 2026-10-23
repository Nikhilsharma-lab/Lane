import { describe, expect, it } from "vitest"
import { parsePeriodKey, periodChoices, periodKey, periodLabel } from "./impact-period"

describe("impact period selector values (#157)", () => {
  it("offers all dates, then the current year and its quarters, then the year before, newest first", () => {
    const choices = periodChoices(2026).map(choice => choice.key)
    expect(choices).toEqual(["all", "2026", "2026-q4", "2026-q3", "2026-q2", "2026-q1", "2025", "2025-q4", "2025-q3", "2025-q2", "2025-q1"])
  })

  it("reads a key back into the period the read model takes, and an unknown key as all dates", () => {
    expect(parsePeriodKey("2026-q3")).toEqual({ kind: "quarter", year: 2026, quarter: 3 })
    expect(parsePeriodKey("2025")).toEqual({ kind: "year", year: 2025 })
    expect(parsePeriodKey("all")).toBeNull()
    expect(parsePeriodKey(undefined)).toBeNull()
    expect(parsePeriodKey("2026-q5")).toBeNull()
    expect(parsePeriodKey("last-week")).toBeNull()
  })

  it("writes a period as the key the selector uses, and labels it in plain words", () => {
    expect(periodKey(null)).toBe("all")
    expect(periodKey({ kind: "quarter", year: 2026, quarter: 4 })).toBe("2026-q4")
    expect(periodKey({ kind: "year", year: 2026 })).toBe("2026")
    expect(periodLabel(null)).toBe("All dates")
    expect(periodLabel({ kind: "quarter", year: 2026, quarter: 4 })).toBe("Q4 2026")
    expect(periodLabel({ kind: "year", year: 2026 })).toBe("2026")
  })
})
