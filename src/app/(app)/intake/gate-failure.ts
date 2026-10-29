import type { IntakeFailure } from "./actions";
import { OFFLINE_ANSWER } from "@/lib/failure-messages";

/** A failure the composer meets on its own side of the action: the call threw. */
export type ClientGateFailure = { code: "offline" | "unavailable"; message: string };
export type GateFailure = IntakeFailure | ClientGateFailure;

export type GateNotice = {
  tone: "warning" | "danger";
  title: string;
  body: string;
  /** Show the "Sign in again" link, which saves the draft before it leaves. */
  signIn: boolean;
};

export const REVIEW_UNAVAILABLE_TITLE = "Review unavailable right now";
export const DRAFT_KEPT = "Your draft is kept.";

/** Plan item 2.3: the action threw. Offline says so; anything else reads as the review being unavailable. */
export function thrownGateFailure(online: boolean): ClientGateFailure {
  return online
    ? { code: "unavailable", message: `${REVIEW_UNAVAILABLE_TITLE}. ${DRAFT_KEPT}` }
    : { code: "offline", message: `${OFFLINE_ANSWER} ${DRAFT_KEPT}` };
}

/**
 * Plan item 2.3: what the composer says when the AI gate does not finish. A
 * timeout, the spend cap, a provider error or limit, a malformed answer and a
 * throw while online all read the same way, because the person's next step is
 * the same. Lane's own review limit, being offline and an ended session are
 * different next steps, so they say so. Every message keeps the draft.
 */
export function gateFailureNotice(failure: GateFailure): GateNotice {
  switch (failure.code) {
    case "session_expired":
      return { tone: "danger", title: "Your session ended", body: `Sign in again to continue. ${DRAFT_KEPT}`, signIn: true };
    case "offline":
      return { tone: "warning", title: "You’re offline", body: failure.message, signIn: false };
    case "rate_limited":
      return { tone: "warning", title: "Review limit reached", body: failure.message, signIn: false };
    case "billing_blocked":
      // #213: the Free Requests are used; the message says why and that an Admin needs to pay.
      return { tone: "warning", title: "An Admin needs to pay", body: `${failure.message} ${DRAFT_KEPT}`, signIn: false };
    case "timeout":
    case "network":
    case "provider":
    case "malformed":
    case "unavailable":
      // A failure tied to a field (the Project check) keeps its own sentence.
      return { tone: "warning", title: REVIEW_UNAVAILABLE_TITLE, body: "field" in failure && failure.field ? failure.message : DRAFT_KEPT, signIn: false };
    default:
      return { tone: "danger", title: "Couldn't prepare the review", body: failure.message, signIn: false };
  }
}
