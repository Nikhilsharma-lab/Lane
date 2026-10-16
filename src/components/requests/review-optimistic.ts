import { addReviewRound, recordReviewResponse, ReviewRuleError, type RequestReviewState, type ReviewPerson, type RespondToReviewInput, type StartReviewInput } from "@/lib/request-review"

/**
 * Plan item 2.6: the Ask for review panel's optimistic layer. Ask and Respond
 * show in the same tick through the domain's own transitions (the ones the
 * server runs), never visibly revert on success, and roll back with the draft
 * on a real failure. No React and no I/O: the panel owns the state and the
 * adapter owns the request.
 */

export type AskDraft = { designUrl: string; question: string; reviewers: ReviewPerson[] }
export type ResponseDraft = { decision: RespondToReviewInput["decision"]; note: string }

export type PendingReview =
  | { token: number; kind: "ask"; next: RequestReviewState; roundId: string; input: StartReviewInput; draft: AskDraft }
  | { token: number; kind: "respond"; next: RequestReviewState; responseId: string; input: RespondToReviewInput; draft: ResponseDraft }

export type ReviewPanelState = { saved: RequestReviewState; pending: PendingReview | null }

export const emptyAskDraft: AskDraft = { designUrl: "", question: "", reviewers: [] }

/** What the panel renders: the pending result while a save is in flight, else the saved state. */
export function shownState(state: ReviewPanelState): RequestReviewState {
  return state.pending?.next ?? state.saved
}

function requireIdle(state: ReviewPanelState) {
  if (state.pending) throw new ReviewRuleError("Wait for the current save to finish, then try again")
}

/** Throws the domain's ReviewRuleError (unchanged messages) without touching the state. */
export function beginAsk(state: ReviewPanelState, input: StartReviewInput, draft: AskDraft, actor: ReviewPerson, at: string, id: string, token: number): ReviewPanelState {
  requireIdle(state)
  const reviewers = input.reviewerIds.map(reviewerId => draft.reviewers.find(person => person.id === reviewerId) ?? { id: reviewerId, name: "Teammate" })
  const next = addReviewRound(state.saved, input, reviewers, actor, at, id)
  return { saved: state.saved, pending: { token, kind: "ask", next, roundId: id, input, draft } }
}

export function beginRespond(state: ReviewPanelState, input: RespondToReviewInput, draft: ResponseDraft, actor: ReviewPerson, at: string, id: string, token: number): ReviewPanelState {
  requireIdle(state)
  const next = recordReviewResponse(state.saved, input, actor, at, id)
  return { saved: state.saved, pending: { token, kind: "respond", next, responseId: id, input, draft } }
}

/** The server's state replaces the pending one with the same content, the real id and the server time; `saved` keeps newer-wins. */
export function confirm(state: ReviewPanelState, token: number, serverState: RequestReviewState): ReviewPanelState {
  if (state.pending?.token !== token) return state
  return { saved: serverState.version >= state.saved.version ? serverState : state.saved, pending: null }
}

/** Drops the pending result and hands back its draft, so the form reopens filled. */
export function rollback(state: ReviewPanelState, token: number): { state: ReviewPanelState; draft: AskDraft | ResponseDraft | null } {
  if (state.pending?.token !== token) return { state, draft: null }
  return { state: { saved: state.saved, pending: null }, draft: state.pending.draft }
}

/** A newer server snapshot replaces `saved`; a pending save is kept (it will confirm, or come back stale and roll back). */
export function reconcile(state: ReviewPanelState, snapshot: RequestReviewState): ReviewPanelState {
  return snapshot.version > state.saved.version ? { saved: snapshot, pending: state.pending } : state
}
