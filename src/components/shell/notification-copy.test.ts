import { describe, expect, it } from "vitest"
import { notificationEvent, notificationRow, type NotificationCopyInput } from "./notification-copy"

// Plan item 2.7: rows read the Request, "Done" is a status, and only unread rows say so.
const base: NotificationCopyInput = {
  type: "comment_added", actorName: "Aditi Rao", requestTitle: "Delivery date on checkout",
  requestNumber: 12, reframedProblem: "Customers cannot find the delivery date before checkout", readAt: null,
}

describe("notificationRow", () => {
  it("reads the saved code and the reframed problem", () => {
    expect(notificationRow(base).primary).toBe("LAN-12 · Customers cannot find the delivery date before checkout")
  })

  it("falls back to the title, then to the bare code", () => {
    expect(notificationRow({ ...base, reframedProblem: null }).primary).toBe("LAN-12 · Delivery date on checkout")
    expect(notificationRow({ ...base, reframedProblem: "  ", requestTitle: null }).primary).toBe("LAN-12")
  })

  it("says Request when the number is 0 or missing", () => {
    expect(notificationRow({ ...base, requestNumber: 0 }).primary).toBe("Request · Customers cannot find the delivery date before checkout")
    expect(notificationRow({ ...base, requestNumber: null }).primary).toBe("Request · Customers cannot find the delivery date before checkout")
  })

  it("capitalises Done and keeps the other event lines neutral", () => {
    expect(notificationEvent("request_done", "Aditi Rao")).toBe("Aditi Rao marked it Done")
    expect(notificationEvent("comment_added", "Aditi Rao")).toBe("Aditi Rao commented")
    expect(notificationEvent("request_picked_up", "Aditi Rao")).toBe("Aditi Rao picked it up")
    expect(notificationEvent("review_requested", "Aditi Rao")).toBe("Aditi Rao asked for your feedback")
    expect(notificationEvent("review_responded", "Aditi Rao")).toBe("Aditi Rao responded to your review")
    expect(notificationEvent("invite_accepted", "Aditi Rao")).toBeNull()
    expect(notificationEvent("something_else", "Aditi Rao")).toBe("Aditi Rao updated it")
  })

  it("renders an invite as one line with Someone as the fallback actor", () => {
    const invite = notificationRow({ ...base, type: "invite_accepted", actorName: null, requestTitle: null, requestNumber: null, reframedProblem: null })
    expect(invite.primary).toBe("Someone accepted your invite")
    expect(invite.secondary).toBeNull()
  })

  it("ends the accessible name in unread only for unread rows, with the time before it", () => {
    expect(notificationRow(base, "Jan 1, 8:00 AM").name).toBe("LAN-12 · Customers cannot find the delivery date before checkout, Aditi Rao commented, Jan 1, 8:00 AM, unread")
    expect(notificationRow({ ...base, readAt: "2026-10-18T09:00:00.000Z" }, "Jan 1, 8:00 AM").name).toBe("LAN-12 · Customers cannot find the delivery date before checkout, Aditi Rao commented, Jan 1, 8:00 AM")
    expect(notificationRow({ ...base, readAt: "2026-10-18T09:00:00.000Z" }).name).not.toMatch(/unread$/)
    expect(notificationRow(base).name).toMatch(/unread$/)
  })

  it("names each read toggle by its Request, so the rows' toggles are told apart", () => {
    expect(notificationRow(base).toggle).toBe("Mark LAN-12 read")
    expect(notificationRow({ ...base, requestNumber: 7, readAt: "2026-10-18T09:00:00.000Z" }).toggle).toBe("Mark LAN-7 unread")
    expect(notificationRow({ ...base, requestNumber: null }).toggle).toBe("Mark notification read")
    expect(notificationRow({ ...base, type: "invite_accepted", requestNumber: null }).toggle).toBe("Mark Aditi Rao’s invite read")
  })
})
