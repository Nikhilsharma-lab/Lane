import { describe, expect, it } from "vitest"
import { momentDay, momentLabel, momentTitle, plannedDay, zoneFreeDay } from "./dates"

// Polish bar §12 (#261): one date format, fixed day-month English, moments in the viewer's zone, planned days the same for everyone.
const now = new Date("2026-10-24T12:00:00.000Z")

describe("a moment", () => {
  it("reads its age for the last day", () => {
    expect(momentLabel("2026-10-24T11:59:30.000Z", { now, timeZone: "UTC" })).toBe("Just now")
    expect(momentLabel("2026-10-24T11:55:00.000Z", { now, timeZone: "UTC" })).toBe("5m ago")
    expect(momentLabel("2026-10-24T11:00:01.000Z", { now, timeZone: "UTC" })).toBe("59m ago")
    expect(momentLabel("2026-10-24T09:00:00.000Z", { now, timeZone: "UTC" })).toBe("3h ago")
    expect(momentLabel("2026-10-23T12:00:01.000Z", { now, timeZone: "UTC" })).toBe("23h ago")
  })

  it("reads as a day from a day old: this year without the year, earlier years with it", () => {
    expect(momentLabel("2026-10-23T12:00:00.000Z", { now, timeZone: "UTC" })).toBe("23 Oct")
    expect(momentLabel("2026-01-01T00:00:00.000Z", { now, timeZone: "UTC" })).toBe("1 Jan")
    expect(momentLabel("2025-12-31T23:59:00.000Z", { now, timeZone: "UTC" })).toBe("31 Dec 2025")
  })

  it("takes Date values as well as saved ISO text", () => {
    expect(momentLabel(new Date("2026-09-06T08:00:00.000Z"), { now, timeZone: "UTC" })).toBe("6 Sep")
  })

  it("reads a moment a little ahead of the clock as just now", () => {
    expect(momentLabel("2026-10-24T12:00:05.000Z", { now, timeZone: "UTC" })).toBe("Just now")
  })

  it("adds the time in 24-hour form when asked", () => {
    expect(momentLabel("2026-10-20T14:30:00.000Z", { now, timeZone: "UTC", time: true })).toBe("20 Oct, 14:30")
    expect(momentLabel("2026-10-20T00:05:00.000Z", { now, timeZone: "UTC", time: true })).toBe("20 Oct, 00:05")
    expect(momentLabel("2025-10-20T23:05:00.000Z", { now, timeZone: "UTC", time: true })).toBe("20 Oct 2025, 23:05")
    expect(momentLabel("2026-10-24T11:55:00.000Z", { now, timeZone: "UTC", time: true })).toBe("5m ago")
  })

  it("can leave the year off for a cell too narrow for it", () => {
    expect(momentLabel("2025-12-31T10:00:00.000Z", { now, timeZone: "UTC", year: false })).toBe("31 Dec")
  })

  it("is in the viewer's zone, so the day near midnight follows them", () => {
    // 19:00 UTC on 19 Oct is 00:30 on 20 Oct in India and 12:00 on 19 Oct in Los Angeles.
    const late = "2026-10-19T19:00:00.000Z"
    expect(momentLabel(late, { now, timeZone: "Asia/Kolkata", time: true })).toBe("20 Oct, 00:30")
    expect(momentLabel(late, { now, timeZone: "America/Los_Angeles", time: true })).toBe("19 Oct, 12:00")
    // 06:00 UTC on 20 Oct is 11:30 the same day in India and 23:00 the day before in Los Angeles.
    const early = "2026-10-20T06:00:00.000Z"
    expect(momentDay(early, { now, timeZone: "Asia/Kolkata" })).toBe("20 Oct")
    expect(momentDay(early, { now, timeZone: "America/Los_Angeles" })).toBe("19 Oct")
  })

  it("judges this year in the viewer's zone", () => {
    // 10:00 UTC on 1 Jan 2026 is 2026 in both zones. 05:00 UTC that day is 1 Jan in India, but 31 Dec 2025 in Los Angeles.
    const newYear = new Date("2026-01-01T10:00:00.000Z")
    expect(momentDay("2026-01-01T05:00:00.000Z", { now: newYear, timeZone: "Asia/Kolkata" })).toBe("1 Jan")
    expect(momentDay("2026-01-01T05:00:00.000Z", { now: newYear, timeZone: "America/Los_Angeles" })).toBe("31 Dec 2025")
  })

  it("reads as a day, never an age, in a sentence", () => {
    expect(momentDay("2026-10-24T11:55:00.000Z", { now, timeZone: "UTC" })).toBe("24 Oct")
    expect(momentDay("2024-02-29T11:55:00.000Z", { now, timeZone: "UTC" })).toBe("29 Feb 2024")
  })

  it("shows the zone-free day before the viewer's zone is known", () => {
    expect(zoneFreeDay("2026-10-19T23:30:00.000Z", now)).toBe("19 Oct")
    expect(zoneFreeDay("2025-10-19T00:30:00.000Z", now)).toBe("19 Oct 2025")
  })

  it("gives the full date and time for hover text", () => {
    expect(momentTitle("2026-10-19T19:00:00.000Z", { timeZone: "Asia/Kolkata" })).toBe("Tuesday 20 October 2026, 00:30")
    expect(momentTitle("2026-10-19T19:00:00.000Z", { timeZone: "America/Los_Angeles" })).toBe("Monday 19 October 2026, 12:00")
  })

  it("ignores the browser's language", () => {
    const label = momentLabel("2026-09-06T08:00:00.000Z", { now, timeZone: "UTC", time: true })
    expect(label).toBe("6 Sep, 08:00")
    expect(label).not.toMatch(/Sept|AM|PM|\//)
  })
})

describe("a planned day", () => {
  it("reads as a day: this year without the year, other years with it", () => {
    expect(plannedDay("2026-10-24", { now })).toBe("24 Oct")
    expect(plannedDay("2026-09-06", { now })).toBe("6 Sep")
    expect(plannedDay("2025-10-24", { now })).toBe("24 Oct 2025")
    expect(plannedDay("2027-01-02", { now })).toBe("2 Jan 2027")
  })

  it("is the same day for everyone, whatever the viewer's zone", () => {
    // A planned day has no zone: 1 Jan stays 1 Jan in Los Angeles, which is still on 31 Dec at UTC midnight.
    expect(plannedDay("2026-01-01", { now })).toBe("1 Jan")
    expect(plannedDay("2026-12-31", { now })).toBe("31 Dec")
  })

  it("never carries a time or a zone", () => {
    expect(plannedDay("2026-10-24", { now })).not.toMatch(/UTC|\d:\d\d/)
  })
})
