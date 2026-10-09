"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, notifications, requests, type NewNotification } from "@/db";
import { requireMemberOrAbove } from "@/lib/auth-guard";
import { getRequestReviewMembers, type ReviewMember } from "@/lib/request-review-members";
import {
  addReviewRound, currentReview, recordReviewResponse, withdrawReviewRound, ReviewRuleError,
  startReviewInputSchema, respondToReviewInputSchema, withdrawReviewInputSchema,
  type ReviewActionResult, type RequestReviewState, type ReviewPerson,
} from "@/lib/request-review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const querySchema = z.string().trim().max(100, "Use a shorter name to find a reviewer");
const staleMessage = "This review changed while you were working. Refresh to see the latest feedback and try again.";

async function reviewAccess(requestId: string, context: { orgId: string }) {
  if (!UUID_RE.test(requestId) || !context || typeof context.orgId !== "string") throw new ReviewRuleError("Request not found");
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) throw new ReviewRuleError("Request not found");
  const [request] = await db.select({
    createdBy: requests.createdBy, version: requests.designReviewVersion, reviews: requests.designReviews,
  }).from(requests).where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId))).limit(1);
  if (!request) throw new ReviewRuleError("Request not found");
  return { auth, request, state: { version: request.version, reviews: request.reviews } satisfies RequestReviewState };
}

function person(member: ReviewMember): ReviewPerson { return { id: member.id, name: member.name }; }
function requireActor(members: ReviewMember[], userId: string) {
  const actor = members.find(member => member.id === userId);
  if (!actor) throw new ReviewRuleError("Your workspace membership could not be confirmed. Refresh and try again.");
  return actor;
}

function actionFailure(error: unknown, operation: string) {
  if (error instanceof ReviewRuleError) return { error: error.message };
  console.error("[request/review] operation failed", { operation, kind: error instanceof Error ? error.name : "UnknownError" });
  return { error: operation === "list" ? "Team members could not be loaded. Try again." : "Lane could not save this review. Your input is still here. Try again." };
}

async function saveReviewState(requestId: string, orgId: string, previous: RequestReviewState, next: RequestReviewState, deliveries: NewNotification[]) {
  await db.transaction(async transaction => {
    const [saved] = await transaction.update(requests).set({ designReviews: next.reviews, designReviewVersion: next.version })
      .where(and(eq(requests.id, requestId), eq(requests.orgId, orgId), eq(requests.designReviewVersion, previous.version)))
      .returning({ id: requests.id });
    if (!saved) throw new ReviewRuleError(staleMessage);
    if (deliveries.length) await transaction.insert(notifications).values(deliveries);
  });
  // A cache refresh failure must not claim the committed review was lost.
  try { revalidatePath(`/requests/${requestId}`); }
  catch { console.error("[request/review] saved review cache refresh failed"); }
  return { state: next };
}

export async function requestDesignReview(requestId: string, input: unknown, context: { orgId: string }): Promise<ReviewActionResult> {
  try {
    const parsed = startReviewInputSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { auth, state } = await reviewAccess(requestId, context);
    if (state.version !== parsed.data.expectedVersion) throw new ReviewRuleError(staleMessage);
    const members = await getRequestReviewMembers(auth.orgId, { userIds: [...new Set([auth.userId, ...parsed.data.reviewerIds])] });
    const actor = requireActor(members, auth.userId);
    const reviewers = parsed.data.reviewerIds.map(id => members.find(member => member.id === id));
    if (reviewers.some(member => !member)) throw new ReviewRuleError("One of these reviewers is no longer available. Choose current teammates who have joined Lane.");
    const selected = reviewers.map(member => person(member!));
    const next = addReviewRound(state, parsed.data, selected, person(actor), new Date().toISOString(), randomUUID());
    return await saveReviewState(requestId, auth.orgId, state, next, selected.map(reviewer => ({
      userId: reviewer.id, orgId: auth.orgId, type: "review_requested", requestId, actorId: auth.userId,
    })));
  } catch (error) { return actionFailure(error, "ask"); }
}

export async function respondToDesignReview(requestId: string, input: unknown, context: { orgId: string }): Promise<ReviewActionResult> {
  try {
    const parsed = respondToReviewInputSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { auth, state } = await reviewAccess(requestId, context);
    if (state.version !== parsed.data.expectedVersion) throw new ReviewRuleError(staleMessage);
    const review = currentReview(state);
    const members = await getRequestReviewMembers(auth.orgId, { userIds: [...new Set([auth.userId, ...(review ? [review.requestedBy.id] : [])])] });
    const actor = requireActor(members, auth.userId);
    const next = recordReviewResponse(state, parsed.data, person(actor), new Date().toISOString(), randomUUID());
    // Departure never prevents someone leaving feedback. Only a still-eligible
    // initiator receives an in-app notification; old review context stays intact.
    const recipient = members.find(member => member.id === review?.requestedBy.id && member.id !== auth.userId);
    return await saveReviewState(requestId, auth.orgId, state, next, recipient ? [{
      userId: recipient.id, orgId: auth.orgId, type: "review_responded", requestId, actorId: auth.userId,
    }] : []);
  } catch (error) { return actionFailure(error, "respond"); }
}

export async function withdrawDesignReview(requestId: string, input: unknown, context: { orgId: string }): Promise<ReviewActionResult> {
  try {
    const parsed = withdrawReviewInputSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { auth, request, state } = await reviewAccess(requestId, context);
    if (state.version !== parsed.data.expectedVersion) throw new ReviewRuleError(staleMessage);
    const actor = requireActor(await getRequestReviewMembers(auth.orgId, { userIds: [auth.userId] }), auth.userId);
    const next = withdrawReviewRound(state, parsed.data, person(actor), new Date().toISOString(), actor.role === "admin" || request.createdBy === auth.userId);
    return await saveReviewState(requestId, auth.orgId, state, next, []);
  } catch (error) { return actionFailure(error, "withdraw"); }
}

export async function listDesignReviewers(requestId: string, query: string, context: { orgId: string }): Promise<{ members: ReviewPerson[] } | { error: string }> {
  try {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { auth } = await reviewAccess(requestId, context);
    // Verify the caller independently because the search query may exclude them.
    requireActor(await getRequestReviewMembers(auth.orgId, { userIds: [auth.userId] }), auth.userId);
    const members = await getRequestReviewMembers(auth.orgId, { query: parsed.data });
    return { members: members.filter(member => member.id !== auth.userId).map(person) };
  } catch (error) { return actionFailure(error, "list"); }
}
