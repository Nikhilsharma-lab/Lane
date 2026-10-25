"use server";
import { changeRequest, fingerprintOf, insist } from "@/lib/request-change-store";
import type { RequestChangeContext } from "@/lib/request-reviewer-rules";
import { personName } from "@/lib/request-journey-access";
import { deliverGuestEmailAfterResponse } from "@/lib/inbox-delivery";

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
      failed: "Could not take this on. Try again.",
    },
    // Taking on is recorded on the Request itself; the person who holds it replays any retry.
    replayOf: (_tx, request, auth) => request.takenOnBy === auth.userId
      ? { actorId: auth.userId, fingerprint: fingerprintOf(fingerprint), result: { success: true as const, revision: request.agreementRevision } }
      : undefined,
    apply: async (tx, { request, auth, roster }) => {
      insist(request.guestSubmission, "Only a Guest submission can be taken on.");
      if (request.takenOnBy) insist(false, `${await personName(tx, roster, request.takenOnBy)} already took this on.`);
      insist(request.createdBy !== auth.userId, "You filed this one. Ask a teammate to take it on.");
      return { set: { takenOnBy: auth.userId, takenOnAt: new Date() } };
    },
  });
  // The Guest's first of their two emails (#206's delivery module), after the response.
  if ("success" in result) deliverGuestEmailAfterResponse({ orgId: context.orgId, requestId: context.requestId, kind: "taken_on" });
  return result;
}
