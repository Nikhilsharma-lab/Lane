import { describe, expect, it } from "vitest"
import type { ReleaseFact, ReleaseState } from "./request-release"
import type { Reviewer } from "./request-reviewer-rules"
import { buildInbox, type InboxRequest, type InboxViewer, type StoredNotification } from "./inbox-read-model"

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
const NOW = { now: new Date("2026-10-25T12:00:00Z") }
const ids = (viewer: InboxViewer, rows: StoredNotification[]) => buildInbox(viewer, { notifications: rows, requests: [] }, NOW).forYourInformation.map(item => item.id)

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
    expect(buildInbox(MEMBER, { notifications: rows, requests: [] }, NOW)).toEqual({ needsYou: [], forYourInformation: [] })
  })

  it("holds only the person's own items", () => {
    const rows = [stored({ id: "mine" }), stored({ id: "theirs", userId: "user_other" })]
    expect(ids(MEMBER, rows)).toEqual(["mine"])
  })

  it("shows a Member items about Requests someone else submitted", () => {
    expect(ids(MEMBER, [stored({ id: "assigned", requestCreatedBy: "user_requester" })])).toEqual(["assigned"])
  })

  it("carries what the row needs to say what happened, and nothing about who the reader is", () => {
    const [item] = buildInbox(MEMBER, { notifications: [stored({ id: "x", type: "request_done", detail: null })], requests: [] }, NOW).forYourInformation
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

// Needs-you items are worked out from Request state at `now`; nothing about them is stored.
const REQUESTER: InboxViewer = { userId: "user_requester", role: "member" }
const REVIEWER: InboxViewer = { userId: "user_reviewer", role: "member" }
const at = (iso: string) => ({ now: new Date(iso) })

function reviewer(over: Partial<Reviewer> = {}): Reviewer {
  return { id: "rev_1", nominee: { kind: "member", userId: REVIEWER.userId }, displayNameAtSelection: "Ravi", addedBy: REQUESTER.userId, note: "Is the copy right?", decision: null, ...over }
}
const concern = (reason = "The date is wrong for pre-orders", when = "2026-10-24T10:00:00.000Z") => ({ kind: "concern" as const, actorId: REVIEWER.userId, at: when, reason })
const looksGood = (when = "2026-10-24T11:00:00.000Z") => ({ kind: "looks_good" as const, actorId: REVIEWER.userId, at: when, reason: "" })
const released = (dueDate = "2026-10-28"): ReleaseFact => ({ exposureDate: "2026-10-21", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-21", windowKind: "relative" })
const releaseState = (release: ReleaseFact | null, ownerId = REQUESTER.userId, history: ReleaseState["history"] = []): ReleaseState => ({ version: 1, ownerId, release, history })

function request(over: Partial<InboxRequest> = {}): InboxRequest {
  return {
    id: "req_a", requestNumber: 12, title: "Checkout copy", reframedProblem: "Customers cannot find the delivery date",
    createdBy: REQUESTER.userId, createdAt: new Date("2026-10-20T09:00:00Z"), status: "open", releaseState: null,
    outcomeClosure: null, exceptionClosure: null, doneAt: null, reviewers: [], reviewAskedAt: null, takenOnBy: null, ...over,
  }
}
const needsYou = (viewer: InboxViewer, requests: InboxRequest[], when = NOW) => buildInbox(viewer, { notifications: [], requests }, when).needsYou
const kinds = (viewer: InboxViewer, requests: InboxRequest[], when = NOW) => needsYou(viewer, requests, when).map(item => `${item.kind} ${item.requestId}`)

describe("Inbox read model: a review waiting on you", () => {
  const asked = request({ reviewers: [reviewer()], reviewAskedAt: new Date("2026-10-23T08:00:00Z") })

  it("appears for the Reviewer while the Request is Open and unanswered, with the question", () => {
    expect(needsYou(REVIEWER, [asked])).toEqual([{
      key: "review:req_a:rev_1:2026-10-23T08:00:00.000Z", kind: "review", requestId: "req_a", requestNumber: 12, requestTitle: "Checkout copy",
      reframedProblem: "Customers cannot find the delivery date", since: new Date("2026-10-23T08:00:00Z"), reviewerName: null,
      detail: "Is the copy right?", dueDate: null,
    }])
  })

  it("clears when the Reviewer answers, either way", () => {
    expect(kinds(REVIEWER, [request({ reviewers: [reviewer({ decision: looksGood() })] })])).toEqual([])
    expect(kinds(REVIEWER, [request({ reviewers: [reviewer({ decision: concern() })] })])).toEqual([])
  })

  it("clears when the work is picked up, or the Request is closed without a result", () => {
    expect(kinds(REVIEWER, [{ ...asked, status: "in_progress" }])).toEqual([])
    expect(kinds(REVIEWER, [{ ...asked, status: "in_progress", exceptionClosure: { kind: "exception" } }])).toEqual([])
  })

  it("is only for the person asked, not other Reviewers or the Requester", () => {
    expect(kinds(REQUESTER, [asked])).toEqual([])
    expect(kinds({ userId: "user_other", role: "member" }, [asked])).toEqual([])
  })

  it("is asked again after an edit reset the answer, and dated from that reset", () => {
    const reset = { ...asked, reviewAskedAt: new Date("2026-10-25T09:00:00Z") }
    expect(needsYou(REVIEWER, [reset]).map(item => [item.key, item.since])).toEqual([["review:req_a:rev_1:2026-10-25T09:00:00.000Z", new Date("2026-10-25T09:00:00Z")]])
  })

  it("dates an ask with no record of when it was made from the Request's creation", () => {
    expect(needsYou(REVIEWER, [{ ...asked, reviewAskedAt: null }])[0].since).toEqual(new Date("2026-10-20T09:00:00Z"))
  })

  it("leaves out an invitation that hasn't become a member yet", () => {
    const invited = request({ reviewers: [reviewer({ nominee: { kind: "invitation", invitationId: "inv_1", email: "ravi@example.test" } })] })
    expect(kinds(REVIEWER, [invited])).toEqual([])
  })
})

describe("Inbox read model: an open Concern on your Request", () => {
  const raised = request({ reviewers: [reviewer({ decision: concern() })] })

  it("appears for the Requester while the Request is Open, naming the Reviewer and the reason", () => {
    expect(needsYou(REQUESTER, [raised])).toEqual([{
      key: "concern:req_a:rev_1:2026-10-24T10:00:00.000Z", kind: "concern", requestId: "req_a", requestNumber: 12, requestTitle: "Checkout copy",
      reframedProblem: "Customers cannot find the delivery date", since: new Date("2026-10-24T10:00:00.000Z"), reviewerName: "Ravi",
      detail: "The date is wrong for pre-orders", dueDate: null,
    }])
  })

  it("is one item per Concern", () => {
    const two = request({ reviewers: [reviewer({ decision: concern() }), reviewer({ id: "rev_2", nominee: { kind: "member", userId: "user_lee" }, displayNameAtSelection: "Lee", decision: { ...concern("Too long", "2026-10-24T12:00:00.000Z"), actorId: "user_lee" } })] })
    expect(needsYou(REQUESTER, [two]).map(item => [item.reviewerName, item.detail])).toEqual([["Lee", "Too long"], ["Ravi", "The date is wrong for pre-orders"]])
  })

  it("clears when the Requester edits the Request, which resets the answer", () => {
    expect(kinds(REQUESTER, [request({ reviewers: [reviewer({ decision: null })] })])).toEqual([])
  })

  it("clears when the Reviewer changes their answer to Looks good", () => {
    expect(kinds(REQUESTER, [request({ reviewers: [reviewer({ decision: looksGood() })] })])).toEqual([])
  })

  it("clears when the work is picked up", () => {
    expect(kinds(REQUESTER, [{ ...raised, status: "in_progress" }])).toEqual([])
  })

  it("is a new item when the Reviewer raises a Concern again", () => {
    const again = request({ reviewers: [reviewer({ decision: concern("Still wrong", "2026-10-25T08:00:00.000Z") })] })
    expect(needsYou(REQUESTER, [again])[0].key).toBe("concern:req_a:rev_1:2026-10-25T08:00:00.000Z")
  })

  it("is only for the Requester, not the Reviewer or anyone else", () => {
    expect(kinds(REVIEWER, [raised])).toEqual([])
    expect(kinds({ userId: "user_other", role: "admin" }, [raised])).toEqual([])
  })
})

describe("Inbox read model: Record the release", () => {
  const doneAt = new Date("2026-10-10T15:00:00Z")
  const done = request({ status: "done", doneAt })

  it("appears at exactly 3 days after Done, not a moment before", () => {
    expect(kinds(REQUESTER, [done], at("2026-10-13T14:59:59.999Z"))).toEqual([])
    expect(needsYou(REQUESTER, [done], at("2026-10-13T15:00:00.000Z"))).toEqual([{
      key: "record_release:req_a:2026-10-10T15:00:00.000Z", kind: "record_release", requestId: "req_a", requestNumber: 12, requestTitle: "Checkout copy",
      reframedProblem: "Customers cannot find the delivery date", since: new Date("2026-10-13T15:00:00.000Z"), reviewerName: null, detail: null, dueDate: null,
    }])
  })

  it("is a single item, the same on every later day", () => {
    const days = ["2026-10-13T15:00:00Z", "2026-10-14T09:00:00Z", "2026-10-20T15:00:00Z", "2026-11-30T09:00:00Z"]
    const reads = days.map(day => needsYou(REQUESTER, [done], at(day)))
    for (const read of reads) expect(read).toEqual(reads[0])
    expect(reads[0]).toHaveLength(1)
  })

  it("clears when the Release is recorded, or the Request is closed without a result", () => {
    expect(kinds(REQUESTER, [{ ...done, releaseState: releaseState(released("2026-12-01")) }], at("2026-10-20T00:00:00Z"))).toEqual([])
    expect(kinds(REQUESTER, [{ ...done, exceptionClosure: { kind: "exception" } }], at("2026-10-20T00:00:00Z"))).toEqual([])
  })

  it("starts again 3 days after a voided Release, as one new item", () => {
    const voided = releaseState(null, REQUESTER.userId, [{
      operationId: "op1", fingerprint: "f", actorId: "user_teammate", at: "2026-10-26T10:00:00.000Z", input: { kind: "void", reason: "Only staging", neverExposed: true },
      previousRelease: released(), release: null, previousOwnerId: REQUESTER.userId, ownerId: REQUESTER.userId, revision: 2,
    }])
    const back = { ...done, releaseState: voided }
    expect(kinds(REQUESTER, [back], at("2026-10-29T09:59:59Z"))).toEqual([])
    expect(needsYou(REQUESTER, [back], at("2026-10-29T10:00:00Z")).map(item => item.key)).toEqual(["record_release:req_a:2026-10-26T10:00:00.000Z"])
  })

  it("is for the Requester, not whoever picked the work up", () => {
    expect(kinds({ userId: "user_builder", role: "member" }, [done], at("2026-10-20T00:00:00Z"))).toEqual([])
  })
})

describe("Inbox read model: Result due", () => {
  const measuring = request({ status: "done", doneAt: new Date("2026-10-20T09:00:00Z"), releaseState: releaseState(released("2026-10-28")) })

  it("appears on the measurement due date (UTC), not the day before", () => {
    expect(kinds(REQUESTER, [measuring], at("2026-10-27T23:59:59Z"))).toEqual([])
    expect(needsYou(REQUESTER, [measuring], at("2026-10-28T00:00:00Z"))).toEqual([{
      key: "result_due:req_a:2026-10-28", kind: "result_due", requestId: "req_a", requestNumber: 12, requestTitle: "Checkout copy",
      reframedProblem: "Customers cannot find the delivery date", since: new Date("2026-10-28T00:00:00.000Z"), reviewerName: null, detail: null, dueDate: "2026-10-28",
    }])
  })

  it("is a single item, never a due-soon warning before it or a weekly overdue one after it", () => {
    const before = ["2026-10-21T09:00:00Z", "2026-10-25T09:00:00Z", "2026-10-27T09:00:00Z"].map(day => kinds(REQUESTER, [measuring], at(day)))
    expect(before).toEqual([[], [], []])
    const after = ["2026-10-28T09:00:00Z", "2026-10-29T09:00:00Z", "2026-11-04T09:00:00Z", "2026-11-05T09:00:00Z", "2027-01-15T09:00:00Z"].map(day => needsYou(REQUESTER, [measuring], at(day)))
    for (const read of after) expect(read).toEqual(after[0])
    expect(after[0]).toHaveLength(1)
  })

  it("clears when the Request is Closed, with or without a result", () => {
    expect(kinds(REQUESTER, [{ ...measuring, outcomeClosure: { kind: "measured" } }], at("2026-11-01T00:00:00Z"))).toEqual([])
    expect(kinds(REQUESTER, [{ ...measuring, exceptionClosure: { kind: "exception" } }], at("2026-11-01T00:00:00Z"))).toEqual([])
  })
})

describe("Inbox read model: handover", () => {
  const transfer = (to: string): ReleaseState["history"][number] => ({
    operationId: "op_transfer", fingerprint: "f", actorId: "user_admin", at: "2026-10-22T10:00:00.000Z", input: { kind: "transfer", recipientId: to, reason: "Asha left" },
    previousRelease: null, release: null, previousOwnerId: REQUESTER.userId, ownerId: to, revision: 1,
  })
  const NEXT: InboxViewer = { userId: "user_next", role: "member" }
  const done = request({ status: "done", doneAt: new Date("2026-10-10T15:00:00Z"), releaseState: { ...releaseState(null, NEXT.userId), history: [transfer(NEXT.userId)] } })
  const measuring = request({ id: "req_b", status: "done", doneAt: new Date("2026-10-10T15:00:00Z"), releaseState: { ...releaseState(released("2026-10-24"), NEXT.userId), history: [transfer(NEXT.userId)] } })

  it("moves the open items to the new Requester", () => {
    expect(kinds(NEXT, [done, measuring]).sort()).toEqual(["record_release req_a", "result_due req_b"])
  })

  it("takes them out of the former Requester's Inbox", () => {
    expect(kinds(REQUESTER, [done, measuring])).toEqual([])
  })
})

describe("Inbox read model: who gets Needs-you items", () => {
  const records = [
    request({ id: "req_review", reviewers: [reviewer({ nominee: { kind: "member", userId: "user_x" } })] }),
    request({ id: "req_done", createdBy: "user_x", status: "done", doneAt: new Date("2026-10-01T00:00:00Z") }),
  ]

  it("gives Admins and Members their items", () => {
    expect(kinds({ userId: "user_x", role: "admin" }, records).sort()).toEqual(["record_release req_done", "review req_review"])
    expect(kinds({ userId: "user_x", role: "member" }, records)).toHaveLength(2)
  })

  it("gives a Guest none, even on their own submission", () => {
    expect(kinds({ userId: "user_x", role: "guest" }, records)).toEqual([])
  })

  it("gives a Viewer none", () => {
    expect(kinds({ userId: "user_x", role: "viewer" }, records)).toEqual([])
  })

  it("lists the newest first", () => {
    const records = [
      request({ id: "req_old", status: "done", doneAt: new Date("2026-10-01T00:00:00Z") }),
      request({ id: "req_new", reviewers: [reviewer({ decision: concern("Why?", "2026-10-25T07:00:00.000Z") })] }),
    ]
    expect(kinds(REQUESTER, records)).toEqual(["concern req_new", "record_release req_old"])
  })
})
