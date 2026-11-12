// #280 (B9): the review answers an Edit Request save clears, and what the dialog says about them. Kept apart from
// request-reviewer-rules.ts, which the Requests list loads on its first paint; only the loader and the editor read this.
import type { Reviewer } from "./request-reviewer-rules";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

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
