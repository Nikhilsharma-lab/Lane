import { describe, expect, it } from "vitest"
import { isPendingReviewer, withAnswer, withReviewerBack, withReviewersAdded, withoutReviewer, type ReviewsShown } from "./reviewer-changes"

// #279 (stories 63-65): what the Reviewers list shows the moment a change is made, before the server answers.
const ana = { id: "r-ana", name: "Ana", note: "Is the API ready?", decision: null, active: true, role: "Designer", canAnswer: false }
const dev = { id: "r-dev", name: "Dev", note: "", decision: { kind: "concern" as const, actorId: "dev", at: "2026-11-01T10:00:00Z", reason: "Too vague" }, active: true, role: "Developer", canAnswer: true }
const view: ReviewsShown = { revision: 4, unavailable: ["member:me", "member:ana", "member:dev"], reviewers: [ana, dev] }

describe("reviewer changes shown at once", () => {
  it("an added reviewer shows straight away with the question, waiting for an answer, and leaves the picker", () => {
    const shown = withReviewersAdded(view, [{ key: "member:sam", name: "Sam" }], "Can we ship by Friday?")
    expect(shown.reviewers.map(r => r.name)).toEqual(["Ana", "Dev", "Sam"])
    const sam = shown.reviewers[2]
    expect(sam).toMatchObject({ note: "Can we ship by Friday?", decision: null, active: true, role: null, canAnswer: false })
    expect(isPendingReviewer(sam)).toBe(true)
    expect(isPendingReviewer(ana)).toBe(false)
    expect(shown.unavailable).toContain("member:sam")
    expect(view.reviewers).toHaveLength(2)
  })

  it("a removed reviewer leaves at once, and Undo puts the same entry back in its place", () => {
    const { shown, removed } = withoutReviewer(view, "r-ana")
    expect(shown.reviewers).toEqual([dev])
    expect(removed).toEqual({ entry: ana, at: 0 })
    expect(withReviewerBack(shown, removed!).reviewers).toEqual([ana, dev])
    expect(withoutReviewer(view, "r-gone").removed).toBeNull()
  })

  it("an answer shows at once, replacing any earlier one", () => {
    const now = new Date("2026-11-12T09:00:00Z")
    const good = withAnswer(view, "r-dev", { kind: "looks_good", reason: "" }, now)
    expect(good.reviewers[1].decision).toMatchObject({ kind: "looks_good", reason: "", at: now.toISOString() })
    const concern = withAnswer(view, "r-dev", { kind: "concern", reason: "Missing the empty state" }, now)
    expect(concern.reviewers[1].decision).toMatchObject({ kind: "concern", reason: "Missing the empty state" })
    expect(concern.reviewers[0]).toBe(ana)
  })
})
