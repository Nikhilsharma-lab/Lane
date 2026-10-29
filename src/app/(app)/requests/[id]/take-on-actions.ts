"use server";
import { changeRequest, fingerprintOf, insist, refuse } from "@/lib/request-change-store";
import type { RequestChangeContext } from "@/lib/request-reviewer-rules";
import { personName } from "@/lib/request-journey-access";
import { deliverGuestEmailAfterResponse } from "@/lib/inbox-delivery";
import { newRequestBlock } from "@/lib/billing";

/**
 * #212: a Member (or Admin) takes on a Guest submission and becomes its Requester, who then writes the prediction.
 * Once only: whoever took it on keeps it (a retry by them replays), and nobody else can take it afterwards. The
 * Guest stays its author and keeps seeing and commenting on it, and hears about it by email once.
 */
export async function takeOnGuestSubmission(context: RequestChangeContext) {
  const fingerprint = { requestId: context.requestId, kind: "take_on" };
  const result = await changeRequest(context, {
    fingerprint,
    messages: {
      invalid: "Invalid take-on action.",
      forbidden: "Only Members and Admins can take on a Guest submission.",
      failed: "Couldn't take this on. Try again.",
    },
    // Taking on is recorded on the Request itself; the person who holds it replays any retry.
    replayOf: (_tx, request, auth) => request.takenOnBy === auth.userId
      ? { actorId: auth.userId, fingerprint: fingerprintOf(fingerprint), result: { success: true as const, revision: request.agreementRevision } }
      : undefined,
    apply: async (tx, { request, auth, roster }) => {
      insist(request.guestSubmission, "Only a Guest submission can be taken on.");
      if (request.takenOnBy) refuse(`${await personName(tx, roster, request.takenOnBy)} already took this on.`);
      // A Guest who has since become a Member can't take their own submission on: someone else answers for it.
      insist(auth.userId !== request.createdBy, "You filed this one. Ask a teammate to take it on.");
      // #213: taking it on counts as a new Request, so it waits while an Admin needs to pay.
      const block = await newRequestBlock(auth, tx);
      if (block) refuse(block);
      return { set: { takenOnBy: auth.userId, takenOnAt: new Date() } };
    },
  });
  // The Guest's first of their two emails (#206's delivery module), after the response.
  if ("success" in result) deliverGuestEmailAfterResponse({ orgId: context.orgId, requestId: context.requestId, kind: "taken_on" });
  return result;
}
