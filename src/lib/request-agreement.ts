import { z } from "zod";
export const nomineeSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("member"), userId: z.string().min(1).max(200) })
    .strict(),
  z
    .object({
      kind: z.literal("invitation"),
      invitationId: z.string().min(1).max(200),
      email: z.email().max(320),
    })
    .strict(),
]);
export type Nominee = z.infer<typeof nomineeSchema>;
/** A hidden ceiling against runaway lists; the screen says nothing unless someone reaches it. */
export const MAX_REVIEWERS = 20;
export const REVIEW_NOTE_MAX = 500;
export const REVIEW_REASON_MAX = 4000;
/** One identity per reviewer: a member, or an invitation until the invitee answers. */
export function nomineeKey(n: Nominee) {
  return n.kind === "member"
    ? `member:${n.userId}`
    : `invitation:${n.invitationId}`;
}
/** A reviewer's answer. A concern carries its reason. */
export type ReviewDecision = {
  kind: "looks_good" | "concern";
  actorId: string;
  at: string;
  reason: string;
};
/** Someone asked to look at the Request before work starts. Optional, and never a gate on pickup. */
export type Reviewer = {
  id: string;
  nominee: Nominee;
  displayNameAtSelection: string;
  addedBy: string;
  /** The optional question from whoever asked for the review. */
  note: string;
  decision: ReviewDecision | null;
};
export type { OutcomeException as ExceptionClosure } from "./request-outcome";
export const agreementContextSchema = z
  .object({
    orgId: z.string().min(1),
    requestId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.uuid(),
  })
  .strict();
export type AgreementContext = z.infer<typeof agreementContextSchema>;
export const reviewerNomineesSchema = z.array(nomineeSchema).max(MAX_REVIEWERS);
export const addReviewersSchema = z
  .object({
    nominees: reviewerNomineesSchema.min(1),
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
/** Profile roles are grey information on a reviewer row; they never grant or block anything. */
export const PROFILE_ROLE_LABELS = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
} as const;
