import { z } from "zod"

export type ReviewPerson = { id: string; name: string }
export type ReviewResponse = { id: string; reviewerId: string; decision: "looks_good" | "changes_requested"; note: string; createdAt: string }
export type DesignReview = {
  id: string; designUrl: string; question: string; requestedBy: ReviewPerson; requestedAt: string;
  reviewers: ReviewPerson[]; responses: ReviewResponse[];
  withdrawal: { by: ReviewPerson; reason: string; at: string } | null;
}
export type RequestReviewState = { version: number; reviews: DesignReview[] }
export type ReviewActionResult = { state: RequestReviewState } | { error: string }

const expectedVersion = z.number().int().min(0).max(2_147_483_646)
const identifier = z.string().min(1).max(200)
const note = z.string().trim().max(5000, "Use 5,000 characters or fewer")
export const startReviewInputSchema = z.object({
  expectedVersion,
  designUrl: z.string().trim().max(2000).url("Add a valid design link").refine(value => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password } catch { return false }
  }, "Use an HTTPS design link without a username or password"),
  question: z.string().trim().min(1, "Describe what needs feedback").max(2000, "Use 2,000 characters or fewer"),
  reviewerIds: z.array(identifier).min(1, "Choose at least one reviewer").max(10, "Choose up to 10 reviewers").refine(ids => new Set(ids).size === ids.length, "Choose each reviewer once"),
})
export const respondToReviewInputSchema = z.object({ expectedVersion, reviewId: identifier, decision: z.enum(["looks_good", "changes_requested"]), note })
  .refine(input => input.decision !== "changes_requested" || input.note.length > 0, { message: "Explain the changes you need", path: ["note"] })
export const withdrawReviewInputSchema = z.object({ expectedVersion, reviewId: identifier, reason: z.string().trim().min(1, "Explain why this review is being withdrawn").max(2000) })
export type StartReviewInput = z.infer<typeof startReviewInputSchema>
export type RespondToReviewInput = z.infer<typeof respondToReviewInputSchema>
export type WithdrawReviewInput = z.infer<typeof withdrawReviewInputSchema>

export class ReviewRuleError extends Error {}
export function currentReview(state: RequestReviewState): DesignReview | undefined { return state.reviews.at(-1) }
export function latestReviewerResponse(review: DesignReview, reviewerId: string): ReviewResponse | undefined { return review.responses.findLast(response => response.reviewerId === reviewerId) }
export function reviewHasAllResponses(review: DesignReview) { return review.reviewers.every(person => latestReviewerResponse(review, person.id)) }

export function addReviewRound(state: RequestReviewState, input: Pick<StartReviewInput, "designUrl" | "question">, reviewers: ReviewPerson[], actor: ReviewPerson, at: string, id: string): RequestReviewState {
  const parsed = startReviewInputSchema.safeParse({ ...input, expectedVersion: state.version, reviewerIds: reviewers.map(person => person.id) })
  if (!parsed.success) throw new ReviewRuleError(parsed.error.issues[0].message)
  if (reviewers.some(person => person.id === actor.id)) throw new ReviewRuleError("Choose someone else to review your design")
  const previous = currentReview(state)
  if (previous && !previous.withdrawal && !reviewHasAllResponses(previous)) throw new ReviewRuleError("Wait for the selected reviewers to respond, or withdraw this review with a reason")
  return { version: state.version + 1, reviews: [...state.reviews, {
    id, designUrl: parsed.data.designUrl, question: parsed.data.question,
    requestedBy: { ...actor }, requestedAt: at, reviewers: reviewers.map(person => ({ ...person })), responses: [], withdrawal: null,
  }] }
}

function requireCurrentReview(state: RequestReviewState, reviewId: string) {
  const review = currentReview(state)
  if (!review || review.id !== reviewId) throw new ReviewRuleError("This is an earlier review. Refresh to see the current review")
  if (review.withdrawal) throw new ReviewRuleError("This review was withdrawn. Its feedback remains in the history")
  return review
}

export function recordReviewResponse(state: RequestReviewState, input: Pick<RespondToReviewInput, "reviewId" | "decision" | "note">, actor: ReviewPerson, at: string, id: string): RequestReviewState {
  const parsed = respondToReviewInputSchema.safeParse({ ...input, expectedVersion: state.version })
  if (!parsed.success) throw new ReviewRuleError(parsed.error.issues[0].message)
  const review = requireCurrentReview(state, input.reviewId)
  if (!review.reviewers.some(person => person.id === actor.id)) throw new ReviewRuleError("Only a selected reviewer can respond to this review")
  const next = { ...review, responses: [...review.responses, { id, reviewerId: actor.id, decision: parsed.data.decision, note: parsed.data.note, createdAt: at }] }
  return { version: state.version + 1, reviews: [...state.reviews.slice(0, -1), next] }
}
export function withdrawReviewRound(state: RequestReviewState, input: Pick<WithdrawReviewInput, "reviewId" | "reason">, actor: ReviewPerson, at: string, canManage = false): RequestReviewState {
  const parsed = withdrawReviewInputSchema.safeParse({ ...input, expectedVersion: state.version })
  if (!parsed.success) throw new ReviewRuleError(parsed.error.issues[0].message)
  const review = requireCurrentReview(state, input.reviewId)
  if (review.requestedBy.id !== actor.id && !canManage) throw new ReviewRuleError("Only the person who requested this review, the Request creator or an admin can withdraw it")
  return { version: state.version + 1, reviews: [...state.reviews.slice(0, -1), { ...review, withdrawal: { by: { ...actor }, reason: parsed.data.reason, at } }] }
}
