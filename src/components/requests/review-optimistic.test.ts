import { describe, expect, it } from "vitest"
import { ReviewRuleError, type RequestReviewState, type ReviewPerson } from "@/lib/request-review"
import { beginAsk, beginRespond, confirm, reconcile, rollback, shownState, type ReviewPanelState } from "./review-optimistic"

// Plan item 2.6: the panel's optimistic state machine over the domain's own transitions.
const alex: ReviewPerson = { id: "alex", name: "Alex Morgan" }
const sam: ReviewPerson = { id: "sam", name: "Sam Lee" }
const taylor: ReviewPerson = { id: "taylor", name: "Taylor Chen" }
const empty: RequestReviewState = { version: 0, reviews: [] }
const waiting: RequestReviewState = { version: 1, reviews: [{ id: "round-1", designUrl: "https://example.com/design?v=1", question: "Clear?", requestedBy: alex, requestedAt: "2026-10-09T10:00:00.000Z", reviewers: [sam, taylor], responses: [], withdrawal: null }] }
const askInput = { expectedVersion: 0, designUrl: "https://example.com/design?v=1", question: "Clear?", reviewerIds: ["sam", "taylor"] }
const askDraft = { designUrl: askInput.designUrl, question: askInput.question, reviewers: [sam, taylor] }
const idle = (saved: RequestReviewState): ReviewPanelState => ({ saved, pending: null })

describe("review optimistic state", () => {
  it("shows the pending result while a save is in flight, else the saved state", () => {
    const state = beginAsk(idle(empty), askInput, askDraft, alex, "2026-10-09T10:10:00.000Z", "local-1", 1)
    expect(shownState(idle(empty))).toBe(empty)
    expect(shownState(state).version).toBe(1)
    expect(shownState(state).reviews[0]).toMatchObject({ id: "local-1", requestedBy: alex, reviewers: [sam, taylor], responses: [] })
    expect(state.saved).toBe(empty)
  })

  it("throws the domain rule without changing the state", () => {
    const state = idle(empty)
    expect(() => beginAsk(state, { ...askInput, reviewerIds: ["alex"] }, { ...askDraft, reviewers: [alex] }, alex, "2026-10-09T10:10:00.000Z", "local-1", 1))
      .toThrow(new ReviewRuleError("Choose someone else to review your design"))
    expect(() => beginAsk(idle(waiting), { ...askInput, expectedVersion: 1 }, askDraft, alex, "2026-10-09T10:10:00.000Z", "local-2", 1))
      .toThrow(/Wait for the selected reviewers to respond/)
    expect(state).toEqual(idle(empty))
  })

  it("refuses a second save while one is pending", () => {
    const pending = beginAsk(idle(empty), askInput, askDraft, alex, "2026-10-09T10:10:00.000Z", "local-1", 1)
    expect(() => beginRespond(pending, { expectedVersion: 0, reviewId: "local-1", decision: "looks_good", note: "" }, { decision: "looks_good", note: "" }, sam, "2026-10-09T10:11:00.000Z", "local-r", 2))
      .toThrow(ReviewRuleError)
  })

  it("confirm replaces the pending round with the server's and keeps saved newer-wins", () => {
    const pending = beginAsk(idle(empty), askInput, askDraft, alex, "2026-10-09T10:10:00.000Z", "local-1", 7)
    const confirmed = confirm(pending, 7, waiting)
    expect(confirmed).toEqual({ saved: waiting, pending: null })
    expect(shownState(confirmed).reviews[0].id).toBe("round-1")
    // A stale token (an earlier save) changes nothing.
    expect(confirm(pending, 6, waiting)).toBe(pending)
    // An older server state never replaces a newer saved one.
    const newer: RequestReviewState = { ...waiting, version: 3 }
    expect(confirm({ saved: newer, pending: pending.pending }, 7, waiting).saved).toBe(newer)
  })

  it("rollback restores saved and returns the draft", () => {
    const pending = beginAsk(idle(empty), askInput, askDraft, alex, "2026-10-09T10:10:00.000Z", "local-1", 3)
    expect(rollback(pending, 3)).toEqual({ state: idle(empty), draft: askDraft })
    expect(rollback(pending, 4)).toEqual({ state: pending, draft: null })
  })

  it("respond records the viewer's response under a local id", () => {
    const draft = { decision: "changes_requested" as const, note: "Show the date first." }
    const pending = beginRespond(idle(waiting), { expectedVersion: 1, reviewId: "round-1", decision: draft.decision, note: draft.note }, draft, sam, "2026-10-09T10:20:00.000Z", "local-r", 5)
    expect(pending.pending).toMatchObject({ kind: "respond", responseId: "local-r", draft })
    expect(shownState(pending).reviews[0].responses).toEqual([{ id: "local-r", reviewerId: "sam", decision: "changes_requested", note: "Show the date first.", createdAt: "2026-10-09T10:20:00.000Z" }])
    expect(rollback(pending, 5).draft).toEqual(draft)
  })

  it("reconcile takes a newer snapshot and keeps the pending save", () => {
    const pending = beginRespond(idle(waiting), { expectedVersion: 1, reviewId: "round-1", decision: "looks_good", note: "" }, { decision: "looks_good", note: "" }, sam, "2026-10-09T10:20:00.000Z", "local-r", 1)
    const newer: RequestReviewState = { ...waiting, version: 2 }
    const reconciled = reconcile(pending, newer)
    expect(reconciled.saved).toBe(newer)
    expect(reconciled.pending).toBe(pending.pending)
    expect(reconcile(pending, waiting)).toBe(pending)
    expect(reconcile(pending, empty)).toBe(pending)
  })
})
