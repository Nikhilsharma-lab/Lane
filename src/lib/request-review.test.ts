import { describe, expect, it } from "vitest"
import { addReviewRound, currentReview, latestReviewerResponse, recordReviewResponse, reviewHasAllResponses, startReviewInputSchema, respondToReviewInputSchema, withdrawReviewRound, type RequestReviewState } from "./request-review"

const author = { id: "author", name: "Alex" }, sam = { id: "sam", name: "Sam" }, lee = { id: "lee", name: "Lee" }
const at = "2026-10-09T09:00:00.000Z"
const input = { designUrl: "https://example.com/design/v1", question: "Does the delivery date make sense?" }
const empty: RequestReviewState = { version: 0, reviews: [] }
const start = () => addReviewRound(empty, input, [sam, lee], author, at, "round-1")

describe("Design feedback rounds", () => {
  it("saves a fixed review target and named reviewers without changing its input", () => {
    const state = start()
    expect(state.version).toBe(1)
    expect(state.reviews[0]).toMatchObject({ id: "round-1", ...input, requestedBy: author, reviewers: [sam, lee], responses: [], withdrawal: null })
    expect(empty.reviews).toEqual([])
  })
  it("requires replies or withdrawal before replacing an unfinished round", () => {
    expect(() => addReviewRound(start(), input, [sam], author, at, "round-2")).toThrow(/respond|withdraw/i)
  })
  it("retains a concern when its author records an updated response", () => {
    const concern = recordReviewResponse(start(), { reviewId: "round-1", decision: "changes_requested", note: "Show the date before checkout" }, sam, at, "reply-1")
    const updated = recordReviewResponse(concern, { reviewId: "round-1", decision: "looks_good", note: "The revised state addresses this" }, sam, at, "reply-2")
    expect(updated.version).toBe(3)
    expect(currentReview(updated)?.responses.map(item => item.decision)).toEqual(["changes_requested", "looks_good"])
    expect(latestReviewerResponse(currentReview(updated)!, "sam")?.id).toBe("reply-2")
    expect(reviewHasAllResponses(currentReview(updated)!)).toBe(false)
  })
  it("counts changes requested as received feedback, never as approval", () => {
    const one = recordReviewResponse(start(), { reviewId: "round-1", decision: "changes_requested", note: "Add the mobile state" }, sam, at, "reply-1")
    const both = recordReviewResponse(one, { reviewId: "round-1", decision: "looks_good", note: "" }, lee, at, "reply-2")
    expect(reviewHasAllResponses(currentReview(both)!)).toBe(true)
    const next = addReviewRound(both, { ...input, designUrl: "https://example.com/design/v2" }, [sam], author, at, "round-2")
    expect(next.reviews).toHaveLength(2)
    expect(next.reviews[0].responses[0].note).toBe("Add the mobile state")
    expect(currentReview(next)?.responses).toEqual([])
    expect(() => recordReviewResponse(next, { reviewId: "round-1", decision: "looks_good", note: "" }, sam, at, "old")).toThrow(/current|earlier/i)
  })
  it("rejects responses by people who were not selected", () => {
    expect(() => recordReviewResponse(start(), { reviewId: "round-1", decision: "looks_good", note: "" }, author, at, "forged")).toThrow(/reviewer|selected/i)
  })
  it("preserves the withdrawal reason and rejects subsequent responses", () => {
    const withdrawn = withdrawReviewRound(start(), { reviewId: "round-1", reason: "The prototype needs a different flow" }, author, at)
    expect(currentReview(withdrawn)?.withdrawal).toEqual({ by: author, at, reason: "The prototype needs a different flow" })
    expect(() => recordReviewResponse(withdrawn, { reviewId: "round-1", decision: "looks_good", note: "" }, sam, at, "late")).toThrow(/withdraw/i)
    expect(addReviewRound(withdrawn, input, [sam], author, at, "round-2").reviews).toHaveLength(2)
  })
  it("allows explicitly authorized withdrawal without making it an approval", () => {
    expect(() => withdrawReviewRound(start(), { reviewId: "round-1", reason: "Initiator left" }, lee, at)).toThrow(/withdraw|request/i)
    const result = withdrawReviewRound(start(), { reviewId: "round-1", reason: "Initiator left" }, lee, at, true)
    expect(currentReview(result)?.withdrawal?.by).toEqual(lee)
    expect(currentReview(result)?.responses).toEqual([])
  })
  it.each(["javascript:alert(1)", "http://example.com", "https://user:secret@example.com"])("rejects unsafe design URL %s", designUrl => {
    expect(startReviewInputSchema.safeParse({ ...input, expectedVersion: 0, reviewerIds: ["sam"], designUrl }).success).toBe(false)
  })
  it("rejects duplicate reviewers and an unexplained change request", () => {
    expect(startReviewInputSchema.safeParse({ ...input, expectedVersion: 0, reviewerIds: ["sam", "sam"] }).success).toBe(false)
    expect(respondToReviewInputSchema.safeParse({ expectedVersion: 1, reviewId: "round-1", decision: "changes_requested", note: " " }).success).toBe(false)
  })
})
