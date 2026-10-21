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
/**
 * The most picks a create payload may carry. MAX_REVIEWERS is enforced with
 * its own message by the shared add rules; this bound only refuses an absurd
 * payload before those rules run.
 */
const CREATE_PICKS_LIMIT = MAX_REVIEWERS * 5;
/** Reviewers picked while creating a Request, with the optional question each of them is sent. */
export const createReviewersSchema = z
  .object({
    nominees: z.array(nomineeSchema).max(CREATE_PICKS_LIMIT),
    note: z.string().trim().max(REVIEW_NOTE_MAX, `Keep the question to ${REVIEW_NOTE_MAX} characters.`),
  })
  .strict()
  .optional();
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
/** What pickup confirms first, from saved reviews: open concerns (who and why) and the unanswered count. */
export type ReviewState = {
  concerns: { name: string; reason: string }[];
  unanswered: number;
};
/**
 * The review state of a reviewers list, as `request_review_state` summarises
 * the saved one: each concern in order (who and why) and the unanswered
 * count, or null when nothing is outstanding.
 */
export function reviewStateOf(
  reviewers: { name: string; decision: { kind: ReviewDecision["kind"]; reason: string } | null }[],
): ReviewState | null {
  const concerns = reviewers.flatMap(({ name, decision }) =>
    decision?.kind === "concern" ? [{ name, reason: decision.reason }] : [],
  );
  const unanswered = reviewers.filter(({ decision }) => decision === null).length;
  return concerns.length || unanswered ? { concerns, unanswered } : null;
}
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
/** The list's marker on an Open Request: "2 concerns", or null when none is open or work has started. */
export function concernMarker(request: {
  status: "open" | "in_progress" | "done";
  reviewState?: ReviewState | null;
}) {
  const count = request.status === "open" ? request.reviewState?.concerns.length ?? 0 : 0;
  return count ? plural(count, "concern", "concerns") : null;
}
export type PickupConfirmation = {
  title: string;
  requests: {
    name: string;
    /** "2 concerns open, 1 review unanswered". */
    summary: string;
    concerns: ReviewState["concerns"];
  }[];
};
/**
 * What picking these Requests up confirms first, or null to pick up straight
 * away. Every pickup entry point asks this; bulk pickup passes every selected
 * Request and gets one combined confirmation. Reviews never block pickup.
 */
export function pickupConfirmation(
  targets: { id?: string; name: string; reviewState?: ReviewState | null }[],
  /** What a reviewers panel last read, by Request id. It is newer than any loaded copy. */
  latest: ReadonlyMap<string, ReviewState | null> = new Map(),
): PickupConfirmation | null {
  const requests = targets.flatMap(({ id, name, reviewState: loaded }) => {
    const reviewState = id !== undefined && latest.has(id) ? latest.get(id) : loaded;
    if (!reviewState || (!reviewState.concerns.length && !reviewState.unanswered)) return [];
    const { concerns, unanswered } = reviewState;
    const summary = [
      concerns.length ? `${plural(concerns.length, "concern", "concerns")} open` : null,
      unanswered ? `${plural(unanswered, "review", "reviews")} unanswered` : null,
    ].filter(Boolean).join(", ");
    return [{ name, summary, concerns }];
  });
  return requests.length ? { title: "Pick up anyway?", requests } : null;
}
/** Profile roles are grey information on a reviewer row; they never grant or block anything. */
export const PROFILE_ROLE_LABELS = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
} as const;
