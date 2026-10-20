import { describe, expect, it } from "vitest"
import { fullLocal, localDayLabel, localLabel, utcDayLabel } from "./local-time"

// Plan item 2.6: the pre-mount label is zone-free; the local label carries the year only outside the current one.
describe("local time labels", () => {
  it("pins the day label to UTC, whatever the host zone", () => {
    // 23:30 UTC is already the next day east of Greenwich, and still the same day west of it.
    expect(utcDayLabel("2026-10-09T23:30:00.000Z")).toBe("Oct 9")
    expect(utcDayLabel("2026-10-09T00:30:00.000Z")).toBe("Oct 9")
    const east = new Date("2026-10-09T23:30:00.000Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" })
    expect(east).toBe("Oct 10")
    expect(utcDayLabel("2026-10-09T23:30:00.000Z")).not.toBe(east)
  })

  it("never carries a zone suffix or a time", () => {
    expect(utcDayLabel("2026-10-09T10:00:00.000Z")).not.toMatch(/UTC|\d:\d\d/)
  })

  it("includes the year only outside the current year", () => {
    const now = new Date("2026-05-01T00:00:00.000Z")
    expect(localLabel("2026-10-09T10:00:00.000Z", now)).not.toContain("2026")
    expect(localLabel("2025-10-09T10:00:00.000Z", now)).toContain("2025")
    expect(localLabel("2026-10-09T10:00:00.000Z", now)).toMatch(/\d:\d\d/)
  })

  it("gives the title the full local date and time", () => {
    expect(fullLocal("2026-10-09T10:00:00.000Z")).toBe(new Date("2026-10-09T10:00:00.000Z").toLocaleString())
  })

  // Plan item 2.8: search rows show the viewer's day, never the UTC day.
  it("labels the day on the viewer's calendar, with no time", () => {
    const now = new Date("2026-10-20T12:00:00.000Z")
    expect(localDayLabel("2026-10-19T19:00:00.000Z", now, "Asia/Kolkata")).toBe(new Date("2026-10-19T19:00:00.000Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "Asia/Kolkata" }))
    expect(localDayLabel("2026-10-19T19:00:00.000Z", now, "Asia/Kolkata")).toMatch(/20/)
    expect(localDayLabel("2026-10-19T19:00:00.000Z", now, "UTC")).toMatch(/19/)
    expect(localDayLabel("2026-10-19T19:00:00.000Z", now, "Asia/Kolkata")).not.toMatch(/\d:\d\d/)
    // 00:30 on 1 January 2026 in India: this year there, so no year; 22:30 on 31 December 2025 carries one.
    expect(localDayLabel("2025-12-31T19:00:00.000Z", now, "Asia/Kolkata")).not.toMatch(/202\d/)
    expect(localDayLabel("2025-12-31T17:00:00.000Z", now, "Asia/Kolkata")).toContain("2025")
  })
})
