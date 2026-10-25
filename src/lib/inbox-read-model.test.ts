import { describe, expect, it } from "vitest"
import { buildInbox, type InboxViewer, type StoredNotification } from "./inbox-read-model"

// Seam 3 (spec #195): the Inbox read model, pure, given the workspace's records and the person.
const MEMBER: InboxViewer = { userId: "user_member", role: "member" }
const GUEST: InboxViewer = { userId: "user_guest", role: "guest" }
const AT = (minute: number) => new Date(Date.UTC(2026, 9, 25, 9, minute))

let next = 0
function stored(over: Partial<StoredNotification> = {}): StoredNotification {
  next += 1
  return {
    id: `n${next}`, userId: MEMBER.userId, type: "comment_added", requestId: "req_a", requestCreatedBy: "user_requester",
    readAt: null, createdAt: AT(next), actorName: "Priya", requestTitle: "Checkout copy", requestNumber: 12,
    reframedProblem: "Customers cannot find the delivery date", detail: null, ...over,
  }
}
const ids = (viewer: InboxViewer, rows: StoredNotification[]) => buildInbox(viewer, { notifications: rows }).forYourInformation.map(item => item.id)

describe("Inbox read model: For your information", () => {
  it("holds picked up, Done, comments, Looks good and invite accepted, newest first", () => {
    const rows = [
      stored({ id: "picked", type: "request_picked_up", createdAt: AT(1) }),
      stored({ id: "done", type: "request_done", createdAt: AT(2) }),
      stored({ id: "comment", type: "comment_added", createdAt: AT(5) }),
      stored({ id: "good", type: "review_looks_good", createdAt: AT(3) }),
      stored({ id: "invite", type: "invite_accepted", requestId: null, requestCreatedBy: null, createdAt: AT(4) }),
    ]
    expect(ids(MEMBER, rows)).toEqual(["comment", "invite", "good", "done", "picked"])
  })

  it("leaves out what is not For your information: review asks, Concerns, resets and reminders", () => {
    const rows = ["review_requested", "review_concern", "review_reset", "review_responded", "release_reminder", "result_due_soon", "result_due", "result_overdue"]
      .map(type => stored({ type }))
    expect(ids(MEMBER, rows)).toEqual([])
  })

  it("clears an item once it is read, and keeps the unread ones", () => {
    const rows = [stored({ id: "unread" }), stored({ id: "read", readAt: AT(30) })]
    expect(ids(MEMBER, rows)).toEqual(["unread"])
  })

  it("is empty once everything is read", () => {
    const rows = [stored({ readAt: AT(30) }), stored({ type: "request_done", readAt: AT(31) })]
    expect(buildInbox(MEMBER, { notifications: rows })).toEqual({ forYourInformation: [] })
  })

  it("holds only the person's own items", () => {
    const rows = [stored({ id: "mine" }), stored({ id: "theirs", userId: "user_other" })]
    expect(ids(MEMBER, rows)).toEqual(["mine"])
  })

  it("shows a Member items about Requests someone else submitted", () => {
    expect(ids(MEMBER, [stored({ id: "assigned", requestCreatedBy: "user_requester" })])).toEqual(["assigned"])
  })

  it("carries what the row needs to say what happened, and nothing about who the reader is", () => {
    const [item] = buildInbox(MEMBER, { notifications: [stored({ id: "x", type: "request_done", detail: null })] }).forYourInformation
    expect(item).toEqual({
      id: "x", type: "request_done", requestId: "req_a", readAt: null, createdAt: item.createdAt, actorName: "Priya",
      requestTitle: "Checkout copy", requestNumber: 12, reframedProblem: "Customers cannot find the delivery date", detail: null,
    })
  })
})

describe("Inbox read model: Guests", () => {
  const forGuest = (over: Partial<StoredNotification>) => stored({ userId: GUEST.userId, ...over })

  it("shows a Guest items about their own submissions", () => {
    const rows = [
      forGuest({ id: "picked", type: "request_picked_up", requestCreatedBy: GUEST.userId }),
      forGuest({ id: "comment", type: "comment_added", requestCreatedBy: GUEST.userId }),
    ]
    expect(ids(GUEST, rows)).toEqual(["comment", "picked"])
  })

  it("hides items about other people's Requests and workspace-wide events from a Guest", () => {
    const rows = [
      forGuest({ id: "other", requestCreatedBy: "user_requester" }),
      forGuest({ id: "invite", type: "invite_accepted", requestId: null, requestCreatedBy: null }),
    ]
    expect(ids(GUEST, rows)).toEqual([])
  })

  it("clears a Guest's read items too", () => {
    expect(ids(GUEST, [forGuest({ requestCreatedBy: GUEST.userId, readAt: AT(40) })])).toEqual([])
  })
})
