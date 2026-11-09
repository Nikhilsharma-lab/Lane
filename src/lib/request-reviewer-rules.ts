// Plain reviewer rules, safe for any page's browser code (the Requests list's rows use concernMarker). The
// schemas server actions and the New Request form validate with are in request-reviewer-schemas.ts, so the
// form-checking library stays out of pages without a form (#266).
/**
 * A Reviewer is always a teammate on a paid seat: an Admin or a Member of the
 * workspace (#211). Email-address and pending-invitation Reviewers are retired.
 */
export type ReviewerIdentity = { kind: "member"; userId: string };
/** Why the server refuses anyone who isn't an Admin or a Member as a Reviewer. */
export const PAID_SEATS_ONLY = "Only Admins and Members can be Reviewers.";
/**
 * The refusal for reviewer picks that didn't parse: a pick that isn't a
 * workspace member (an email address, an invitation) is refused for not being
 * on a paid seat; anything else is a malformed pick.
 */
export function reviewerPickRefusal(nominees: unknown) {
  const notAMember = Array.isArray(nominees) && nominees.some((nominee) =>
    typeof nominee !== "object" || nominee === null || (nominee as { kind?: unknown }).kind !== "member");
  return notAMember ? PAID_SEATS_ONLY : "Choose people to review.";
}
/** A hidden ceiling against runaway lists; the screen says nothing unless someone reaches it. */
export const MAX_REVIEWERS = 20;
export const REVIEW_NOTE_MAX = 500;
export const REVIEW_REASON_MAX = 4000;
/** One identity per reviewer. */
export function reviewerKey(n: ReviewerIdentity) {
  return `member:${n.userId}`;
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
  nominee: ReviewerIdentity;
  displayNameAtSelection: string;
  addedBy: string;
  /** The optional question from whoever asked for the review. */
  note: string;
  decision: ReviewDecision | null;
};
/** Which Request a lifecycle change is for, the revision it was made on, and its retry key. */
export type RequestChangeContext = { orgId: string; requestId: string; expectedRevision: number; operationId: string };
/** What the Request page knows of a saved reviewer before the reviewers load (#295): enough to hold their row's shape. */
export type ReviewerOutline = { note: boolean; concern: boolean; mine: boolean };

/** What pickup confirms first, from saved reviews: open concerns (who and why) and the unanswered count. */
export type ReviewState = {
  concerns: { name: string; reason: string }[];
  unanswered: number;
};
/**
 * The review state of a reviewers list: each counted concern in order (who
 * and why) and the counted unanswered reviews, or null when nothing is
 * outstanding. The server reads `counts` from `reviewerStanding`; the panel
 * from each reviewer's `active`.
 */
export function reviewStateOf(
  reviewers: { name: string; decision: { kind: ReviewDecision["kind"]; reason: string } | null; counts: boolean }[],
): ReviewState | null {
  // A reviewer who left the workspace or lost their paid seat no longer counts (§4.4).
  const counted = reviewers.filter(({ counts }) => counts);
  const concerns = counted.flatMap(({ name, decision }) =>
    decision?.kind === "concern" ? [{ name, reason: decision.reason }] : [],
  );
  const unanswered = counted.filter(({ decision }) => decision === null).length;
  return concerns.length || unanswered ? { concerns, unanswered } : null;
}
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
/** The saved review answers an edit would clear: who raised each concern, and how many other answers there are. */
export type AnsweredReviews = { concerns: string[]; others: number };

/** The answers on an Open Request's saved reviewers (`reviewers` is null after pickup), or null when nobody answered. */
export function answeredReviewsOf(reviewers: Pick<Reviewer, "displayNameAtSelection" | "decision">[] | null): AnsweredReviews | null {
  const answered = (reviewers ?? []).filter(reviewer => reviewer.decision);
  if (!answered.length) return null;
  const concerns = answered.filter(reviewer => reviewer.decision?.kind === "concern").map(reviewer => reviewer.displayNameAtSelection);
  return { concerns, others: answered.length - concerns.length };
}

const listed = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * #280 (B9): what the Edit dialog says before a save that clears review answers (every change to the Request's
 * content does while it is Open), or null when nobody has answered. Concerns are named; other answers are counted.
 */
export function reviewResetWarning(answers: AnsweredReviews | null | undefined): string | null {
  if (!answers || !(answers.concerns.length + answers.others)) return null;
  const { concerns, others } = answers;
  const cleared = concerns.length
    ? `${listed(concerns.map(name => `${name}’s`))} ${concerns.length === 1 ? "concern" : "concerns"}${others ? ` and ${plural(others, "other answer", "other answers")}` : ""}`
    : plural(others, "review answer", "review answers");
  return `Saving clears ${cleared}. They’ll be told.`;
}
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
