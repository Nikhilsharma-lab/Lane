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
  void input; void reviewers; void actor; void at; void id;
  return state
}
export function recordReviewResponse(state: RequestReviewState, input: Pick<RespondToReviewInput, "reviewId" | "decision" | "note">, actor: ReviewPerson, at: string, id: string): RequestReviewState {
  void input; void actor; void at; void id;
  return state
}
export function withdrawReviewRound(state: RequestReviewState, input: Pick<WithdrawReviewInput, "reviewId" | "reason">, actor: ReviewPerson, at: string, canManage = false): RequestReviewState {
  void input; void actor; void at; void canManage;
  return state
}
