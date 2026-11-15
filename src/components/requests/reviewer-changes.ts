import type { ReviewDecision } from "@/lib/request-reviewer-rules"

/**
 * #279 (stories 63-65): what the Reviewers list shows the moment a change is made. The panel shows these at once, sends
 * the change, and goes back to the last read if the server refuses. Pure, so the list's rules are tested apart.
 */

/** A reviewer as the panel shows them (readReviews' rows). */
export type ShownReviewer = {
  id: string
  name: string
  note: string
  decision: ReviewDecision | null
  active: boolean
  role: string | null
  canAnswer: boolean
}

/** The parts of the reviews read a change touches. */
export type ReviewsShown = { revision: number; unavailable: string[]; reviewers: ShownReviewer[] }

/** A removed reviewer and their place in the list, which Undo puts back. */
export type RemovedReviewer = { entry: ShownReviewer; at: number }

const PENDING = "pending:"

/** Whether a row is an added reviewer the server hasn't confirmed yet: it has no id to change until then. */
export const isPendingReviewer = (reviewer: Pick<ShownReviewer, "id">) => reviewer.id.startsWith(PENDING)

/** People just asked to review: on the list straight away, waiting for an answer, and out of the picker. */
export function withReviewersAdded<V extends ReviewsShown>(view: V, people: { key: string; name: string }[], note: string): V {
  return {
    ...view,
    unavailable: [...view.unavailable, ...people.map(p => p.key)],
    reviewers: [...view.reviewers, ...people.map(p => ({ id: `${PENDING}${p.key}`, name: p.name, note: note.trim(), decision: null, active: true, role: null, canAnswer: false }))],
  }
}

/** The list without one reviewer, and what Undo needs to put them back; `removed` is null if they're not listed. */
export function withoutReviewer<V extends ReviewsShown>(view: V, id: string): { shown: V; removed: RemovedReviewer | null } {
  const at = view.reviewers.findIndex(r => r.id === id)
  if (at < 0) return { shown: view, removed: null }
  return { shown: { ...view, reviewers: view.reviewers.filter(r => r.id !== id) }, removed: { entry: view.reviewers[at], at } }
}

/** A removed reviewer back in their old place, exactly as they were. */
export function withReviewerBack<V extends ReviewsShown>(view: V, { entry, at }: RemovedReviewer): V {
  const reviewers = view.reviewers.filter(r => r.id !== entry.id)
  reviewers.splice(Math.min(at, reviewers.length), 0, entry)
  return { ...view, reviewers }
}

/** A reviewer's answer, shown at once in place of any earlier one. */
export function withAnswer<V extends ReviewsShown>(view: V, id: string, answer: Pick<ReviewDecision, "kind" | "reason">, now = new Date()): V {
  return {
    ...view,
    reviewers: view.reviewers.map(r => r.id === id ? { ...r, decision: { kind: answer.kind, reason: answer.reason, actorId: r.decision?.actorId ?? "", at: now.toISOString() } } : r),
  }
}
