import { z } from "zod";
import { MAX_REVIEWERS, REVIEW_NOTE_MAX, REVIEW_REASON_MAX, type RequestChangeContext, type ReviewerIdentity } from "./request-reviewer-rules";
/**
 * The reviewer schemas server actions and the New Request form validate with. Kept apart from the plain rules in
 * request-reviewer-rules.ts, which the Requests list's rows import, so the list's browser code carries no zod (#266).
 */
export const reviewerIdentitySchema = z
  .object({ kind: z.literal("member"), userId: z.string().min(1).max(200) })
  .strict();
export const requestChangeContextSchema = z
  .object({
    orgId: z.string().min(1),
    requestId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.uuid(),
  })
  .strict();
export const reviewerIdentitiesSchema = z.array(reviewerIdentitySchema).max(MAX_REVIEWERS);
/**
 * The most picks a create payload may carry. MAX_REVIEWERS is enforced with
 * its own message by the shared add rules; this bound only refuses an absurd
 * payload before those rules run.
 */
const CREATE_PICKS_LIMIT = MAX_REVIEWERS * 5;
/** Reviewers picked while creating a Request, with the optional question each of them is sent. */
export const createReviewersSchema = z
  .object({
    nominees: z.array(reviewerIdentitySchema).max(CREATE_PICKS_LIMIT),
    note: z.string().trim().max(REVIEW_NOTE_MAX, `Keep the question to ${REVIEW_NOTE_MAX} characters.`),
  })
  .strict()
  .optional();
export const addReviewersSchema = z
  .object({
    nominees: reviewerIdentitiesSchema.min(1),
    note: z.string().trim().max(REVIEW_NOTE_MAX),
  })
  .strict();
export const removeReviewerSchema = z
  .object({ reviewerId: z.uuid() })
  .strict();
export const answerReviewSchema = z
  .object({
    reviewerId: z.uuid(),
    kind: z.enum(["looks_good", "concern"]),
    reason: z.string().trim().max(REVIEW_REASON_MAX),
  })
  .strict();

// The plain types in request-reviewer-rules.ts are exactly what these schemas accept.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameIdentity: Same<z.infer<typeof reviewerIdentitySchema>, ReviewerIdentity> = true;
const sameContext: Same<z.infer<typeof requestChangeContextSchema>, RequestChangeContext> = true;
void sameIdentity; void sameContext;
