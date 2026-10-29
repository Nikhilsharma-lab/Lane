import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { needsYouRow } from "./needs-you-copy"
import type { NeedsYouInboxItem } from "./inbox-item"

// Dates read "24 Oct" in the current year and "24 Oct 2025" in others (#261): pin the year these fixtures are in.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-23T12:00:00.000Z") }) })
afterAll(() => { vi.useRealTimers() })

const item = (over: Partial<NeedsYouInboxItem> = {}): NeedsYouInboxItem => ({
  key: "review:req-1:rev-1:2026-10-25T09:00:00.000Z", kind: "review", requestId: "req-1", requestNumber: 12, requestTitle: "Checkout copy",
  reframedProblem: "Customers cannot find the delivery date", since: "2026-10-25T09:00:00.000Z", reviewerName: null, detail: null, dueDate: null, ...over,
})

describe("what a Needs-you row says", () => {
  it("names the Request on line 1, as every Inbox row does", () => {
    expect(needsYouRow(item()).primary).toBe("LAN-12 · Customers cannot find the delivery date")
    expect(needsYouRow(item({ reframedProblem: null })).primary).toBe("LAN-12 · Checkout copy")
    expect(needsYouRow(item({ requestNumber: 0, reframedProblem: null, requestTitle: null })).primary).toBe("Request")
  })

  it("asks for the review, with the question", () => {
    const row = needsYouRow(item({ detail: "Is the copy right?" }), "Oct 25, 9:00 AM")
    expect(row.secondary).toBe("Waiting for your review")
    expect(row.detail).toBe("Is the copy right?")
    expect(row.showsTime).toBe(true)
    expect(row.name).toBe("LAN-12 · Customers cannot find the delivery date, Waiting for your review, Is the copy right?, Oct 25, 9:00 AM")
  })

  it("names who raised a Concern and why", () => {
    const row = needsYouRow(item({ kind: "concern", reviewerName: "Ravi", detail: "The date is wrong" }))
    expect(row.secondary).toBe("Ravi raised a concern")
    expect(row.detail).toBe("The date is wrong")
    expect(needsYouRow(item({ kind: "concern", reviewerName: " " })).secondary).toBe("A Reviewer raised a concern")
  })

  it("asks once for the release, from Lane rather than a person, with no time", () => {
    const row = needsYouRow(item({ kind: "record_release" }), "Oct 25, 9:00 AM")
    expect(row.secondary).toBe("Still Done. Record the release once it is live")
    expect(row.showsTime).toBe(false)
    expect(row.name).toBe("LAN-12 · Customers cannot find the delivery date, Still Done. Record the release once it is live")
  })

  it("says the result is due, with the due date", () => {
    const row = needsYouRow(item({ kind: "result_due", dueDate: "2026-10-28" }))
    expect(row.secondary).toBe("Result due 28 Oct. Close it when you have the numbers")
    expect(row.showsTime).toBe(false)
  })
})
