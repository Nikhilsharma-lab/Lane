"use server";
import { canChange, seeable } from "@/lib/request-access";
import { canChangeThings } from "@/lib/role-rules";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, requests, requestAgreements, requestAgreementEvents } from "@/db";
import { guardActiveMember, guardCanChange, type MemberAuth } from "@/lib/auth-guard";
import {
  addReviewersSchema,
  removeReviewerSchema,
  answerReviewSchema,
  reviewerKey,
  reviewerPickRefusal,
  type RequestChangeContext,
  type Reviewer,
} from "@/lib/request-reviewer-rules";
import { workspaceRoster, type WorkspacePerson } from "@/lib/workspace-roster";
import { appendReviewers, notifyReviewers, reviewerViews } from "@/lib/request-reviewers";
import {
  changeRequest,
  insist,
  RequestChangeError,
  type RequestTx,
  type StoredRequest,
} from "@/lib/request-change-store";
import { deliverAfterResponse } from "@/lib/inbox-delivery";

type ReviewersRow = typeof requestAgreements.$inferSelect;

/**
 * A reviewer change through changeRequest. Reviewers change only while the
 * Request is Open; every change is logged with the reviewers before and after,
 * and that log is how a retried operation replays.
 */
function changeReviewers(
  context: RequestChangeContext,
  input: unknown,
  kind: "reviewers_added" | "reviewer_removed" | "reviewed",
  rule: (tx: RequestTx, request: StoredRequest, reviewersRow: ReviewersRow | undefined, auth: MemberAuth, roster: WorkspacePerson[]) => Promise<void>,
) {
  return changeRequest(context, {
    fingerprint: { requestId: context.requestId, kind, input },
    messages: {
      invalid: "Invalid review action.",
      forbidden: "You cannot change reviews in this workspace.",
      failed: "Couldn’t save the review. Your input is preserved; try again.",
    },
    replayOf: async (tx, _request, auth) => {
      const [previous] = await tx
        .select()
        .from(requestAgreementEvents)
        .where(and(
          eq(requestAgreementEvents.orgId, auth.orgId),
          eq(requestAgreementEvents.actorId, auth.userId),
          eq(requestAgreementEvents.operationId, context.operationId),
        ));
      return previous && { actorId: previous.actorId, fingerprint: previous.payload.fingerprint, result: previous.payload.result };
    },
    apply: async (tx, { request, auth, roster, revision, fingerprint }) => {
      insist(request.status === "open", "Work has started. Reviews can no longer change.");
      const reviewersRowOf = async () => (await tx
        .select()
        .from(requestAgreements)
        .where(and(eq(requestAgreements.requestId, request.id), eq(requestAgreements.orgId, auth.orgId))))[0];
      const reviewersRow = await reviewersRowOf();
      const before = reviewersRow ? structuredClone(reviewersRow) : null;
      await rule(tx, request, reviewersRow, auth, roster);
      await tx.insert(requestAgreementEvents).values({
        orgId: auth.orgId,
        requestId: request.id,
        revision,
        operationId: context.operationId,
        actorId: auth.userId,
        kind,
        payload: { version: 1, fingerprint, input, before, after: await reviewersRowOf(), result: { success: true, revision } },
      });
    },
  });
}

/** #206: once a change is saved, the Needs-you items it caused leave Lane after the response. */
async function delivering<T extends object>(context: RequestChangeContext, change: Promise<T>): Promise<T> {
  const result = await change;
  if ("success" in result) deliverAfterResponse({ orgId: context.orgId, requestId: context.requestId });
  return result;
}

async function saveReviewers(
  tx: RequestTx,
  request: StoredRequest,
  reviewersRow: ReviewersRow | undefined,
  reviewers: Reviewer[],
) {
  if (reviewersRow)
    await tx
      .update(requestAgreements)
      .set({ reviewers })
      .where(
        and(
          eq(requestAgreements.requestId, request.id),
          eq(requestAgreements.orgId, request.orgId),
        ),
      );
  else
    await tx
      .insert(requestAgreements)
      .values({ orgId: request.orgId, requestId: request.id, reviewers });
}

/** An Admin or Member asks other Admins or Members to look at an Open Request. */
export async function addReviewers(context: RequestChangeContext, input: unknown) {
  const parsed = addReviewersSchema.safeParse(input);
  if (!parsed.success)
    return { error: reviewerPickRefusal((input as { nominees?: unknown } | null)?.nominees) };
  return delivering(context, changeReviewers(
    context,
    parsed.data,
    "reviewers_added",
    async (tx, request, reviewersRow, auth, roster) => {
      const { reviewers, asked } = await appendReviewers({
        existing: reviewersRow?.reviewers ?? [],
        nominees: parsed.data.nominees,
        note: parsed.data.note,
        auth,
        requesterId: request.createdBy,
        roster,
      });
      await saveReviewers(tx, request, reviewersRow, reviewers);
      await notifyReviewers(tx, request, auth.userId, asked);
    },
  ));
}

/** The requester or an admin takes someone off an Open Request. */
export async function removeReviewer(context: RequestChangeContext, input: unknown) {
  const parsed = removeReviewerSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a reviewer to remove." };
  return changeReviewers(
    context,
    parsed.data,
    "reviewer_removed",
    async (tx, request, reviewersRow, auth) => {
      insist(canChange(auth, request), "Only the Requester or a workspace admin can remove a reviewer.");
      const reviewers = reviewersRow?.reviewers ?? [];
      insist(
        reviewers.some((r) => r.id === parsed.data.reviewerId),
        "This reviewer was already removed. Reload to see the latest.",
      );
      await saveReviewers(
        tx,
        request,
        reviewersRow,
        reviewers.filter((r) => r.id !== parsed.data.reviewerId),
      );
    },
  );
}

/** Only the named reviewer answers: Looks good, or a concern with its reason. They can change it later. */
export async function answerReview(context: RequestChangeContext, input: unknown) {
  const parsed = answerReviewSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid review answer." };
  if (parsed.data.kind === "concern" && !parsed.data.reason)
    return { error: "Say what concerns you." };
  const answered = changeReviewers(
    context,
    parsed.data,
    "reviewed",
    async (tx, request, reviewersRow, auth) => {
      const reviewers = structuredClone(reviewersRow?.reviewers ?? []);
      const reviewer = reviewers.find((r) => r.id === parsed.data.reviewerId);
      insist(reviewer, "This review was removed. Reload to see the latest.");
      insist(
        reviewer.nominee.userId === auth.userId,
        "Only the named reviewer can answer.",
      );
      reviewer.decision = {
        kind: parsed.data.kind,
        actorId: auth.userId,
        at: new Date().toISOString(),
        reason: parsed.data.kind === "concern" ? parsed.data.reason : "",
      };
      await saveReviewers(tx, request, reviewersRow, reviewers);
      await notifyReviewers(tx, request, auth.userId, [
        {
          userId: reviewer.addedBy,
          type: parsed.data.kind === "concern" ? "review_concern" : "review_looks_good",
          detail: reviewer.decision.reason,
        },
      ]);
    },
  );
  // A Concern needs the Requester; Looks good is For your information and stays inside Lane.
  return parsed.data.kind === "concern" ? delivering(context, answered) : answered;
}

export async function readReviews(
  requestId: string,
  context: { orgId: string },
) {
  try {
    if (!z.uuid().safeParse(requestId).success)
      return { error: "Request unavailable." };
    const auth = await guardActiveMember(context.orgId, "Request unavailable.");
    if ("error" in auth) return auth;
    const [request] = await db
      .select()
      .from(requests)
      .where(and(eq(requests.id, requestId), seeable(auth)));
    insist(request, "Request unavailable.");
    const [reviewersRow] = await db
      .select()
      .from(requestAgreements)
      .where(
        and(
          eq(requestAgreements.requestId, requestId),
          eq(requestAgreements.orgId, auth.orgId),
        ),
      );
    const saved = reviewersRow?.reviewers ?? [];
    const open = request.status === "open";
    const reviewers = await reviewerViews(saved, auth, open);
    return {
      requestId,
      revision: request.agreementRevision,
      open,
      canAdd: open && canChangeThings(auth.role),
      /** An Admin can invite someone to the workspace; nobody becomes a Reviewer by invitation. */
      canInvite: open && auth.role === "admin",
      canRemove: open && canChange(auth, request),
      /** People the picker leaves out: the viewer, the requester and anyone already reviewing. */
      unavailable: [
        reviewerKey({ kind: "member", userId: auth.userId }),
        reviewerKey({ kind: "member", userId: request.createdBy }),
        ...saved.map((r) => reviewerKey(r.nominee)),
      ],
      reviewers,
    };
  } catch (e) {
    return {
      error:
        e instanceof RequestChangeError
          ? e.message
          : "Couldn't load reviews. Try again.",
    };
  }
}

/**
 * The people a Reviewer can be chosen from: the workspace's Admins and
 * Members only (#211). `canInvite` tells the picker whether to point an Admin
 * to Members settings or tell anyone else to ask an Admin.
 */
export async function loadReviewerPeople(context: { orgId: string }) {
  const auth = await guardCanChange(context.orgId, "Workspace unavailable.");
  if ("error" in auth) return auth;
  try {
    return { people: await workspaceRoster(auth.orgId), canInvite: auth.role === "admin" };
  } catch {
    return { error: "Couldn't load people. Try again." };
  }
}
