"use server";
import { changeable } from "@/lib/request-access";
import { canUseLabels } from "@/lib/label-access";
import { sourceRequestType } from "@/lib/request-labels";

import type { OverviewRequest } from "@/lib/request-overview";

import { z } from "zod";
import { requestEditSourceSchema } from "@/lib/request-edit";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, requests, requestAgreements } from "@/db";
import {
  triageRequest,
  type TriageFailureKind,
  type TriageResult,
} from "@/lib/ai/triage";
import { canUseProject } from "@/lib/project-access";
import type { RequestType } from "@/lib/request-properties";
import { TEXT_KEPT } from "@/lib/failure-messages";
import { requireCanContribute, signedInAsViewer, VIEWER_REFUSAL, type MemberAuth } from "@/lib/auth-guard";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { newRequestSchemaFor, sourceFieldOf, storedContext, type RequestInput, type RequestSourceField } from "@/lib/request-schema";
import { impactColumnsOf, impactStateOfChoice } from "@/lib/request-impact";
import { framingShape, savedFraming } from "@/lib/request-framing";
import { createTriageToken, verifyTriageToken } from "@/lib/triage-token";
import { createReviewersSchema, reviewerPickRefusal, type Reviewer } from "@/lib/request-reviewer-rules";
import { workspaceRoster } from "@/lib/workspace-roster";
import { RequestChangeError, insist, type RequestTx } from "@/lib/request-change-store";
import { appendReviewers, notifyReviewers, type ReviewNotification } from "@/lib/request-reviewers";
import { deliverAfterResponse } from "@/lib/inbox-delivery";
import { checkPredictionMetrics } from "@/lib/metrics-library";
import { newRequestBlock } from "@/lib/billing";
import { billingEnforced } from "@/lib/feature-switches";

export type IntakeFailureCode =
  | "validation"
  | "session_expired"
  | "rate_limited"
  | "timeout"
  | "network"
  | "provider"
  | "malformed"
  | "review_expired"
  | "save_failed"
  /** #213: the Free Requests are used (or the plan lapsed) and an Admin needs to pay. */
  | "billing_blocked";

export type IntakeFailure = {
  code: IntakeFailureCode;
  message: string;
  field?:
    | RequestSourceField
    | "editedProblemText"
    | "reviewers";
  retryAfterSeconds?: number;
};

export type TriageResponse =
  | { success: true; triage: TriageResult; token: string }
  | { success: false; error: IntakeFailure };

export type SaveResponse =
  | { success: true; requestId: string; created?: OverviewRequest }
  | { success: false; error: IntakeFailure };

/** The saved Request in the list's row shape, so the composer can show it in the
 * Open group before the revalidated list arrives (plan item 1.5). Names come
 * from the client; the server row replaces this one as soon as it lands. */
function savedListRow(
  row: { id: string; requestNumber?: number | null; createdAt?: Date | null },
  payload: { labelKeys?: string[]; title: string; projectId: string | null; requestType: OverviewRequest["requestType"]; priority: OverviewRequest["priority"] },
  reframedProblem: string | null
): OverviewRequest {
  return {
    id: row.id,
    requestNumber: row.requestNumber ?? undefined,
    title: payload.title,
    reframedProblem,
    status: "open",
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    creatorName: null,
    assigneeName: null,
    assignedTo: null,
    projectId: payload.projectId,
    projectName: null,
    requestType: payload.requestType ?? null,
    labelKeys: payload.labelKeys,
    priority: payload.priority,
  };
}

// Plan item 2.3: every way the AI review can fail to finish reads the same,
// because the next step is the same. A provider 429 is the provider's limit,
// so it answers "provider": "rate_limited" means Lane's own limiter only.
const REVIEW_UNAVAILABLE = `Review unavailable right now. ${TEXT_KEPT}`;
const TRIAGE_FAILURES: Record<TriageFailureKind, IntakeFailure> = {
  timeout: { code: "timeout", message: REVIEW_UNAVAILABLE },
  rate_limited: { code: "provider", message: REVIEW_UNAVAILABLE },
  malformed: { code: "malformed", message: REVIEW_UNAVAILABLE },
  network: { code: "network", message: REVIEW_UNAVAILABLE },
  provider: { code: "provider", message: REVIEW_UNAVAILABLE },
};

/** Why the guard said no: a Viewer can't file (#210); anyone else's session has ended. */
async function sessionFailure(): Promise<IntakeFailure> {
  if (await signedInAsViewer()) return { code: "validation", message: VIEWER_REFUSAL };
  return {
    code: "session_expired",
    message: "Your session ended. Sign in again to continue this Request.",
  };
}

// The action response then carries the refreshed list and detail, so the
// client does not refresh the router a second time after a successful save.
// A cache refresh failure must not claim the committed Request was lost.
function revalidateSavedRequest(requestId: string) {
  try {
    revalidatePath("/");
    revalidatePath(`/requests/${requestId}`);
  } catch {
    console.error("[intake] saved Request cache refresh failed");
  }
}

export async function runTriage(
  formData: {
    expectedImpact?: RequestInput["expectedImpact"];
    projectId?: string | null;
    requestType?: RequestType | null;
    labelKeys?: string[];
    priority?: RequestInput["priority"];
    title: string;
    description: string;
    affectedPeople?: string;
    desiredChange?: string;
    observedEvidence?: string;
    uncertainty?: string;
    usefulLink?: string;
  },
  context: { orgId: string },
  existingRequestId?: string
): Promise<TriageResponse> {
  const auth = await requireCanContribute(context.orgId);
  if (!auth) return { success: false, error: await sessionFailure() };

  // #213: a workspace that needs to pay hears so before writing anything more or spending a review. A Guest's
  // submission isn't a new Request until a Member takes it on, so a Guest can still file.
  if (existingRequestId === undefined && auth.role !== "guest") {
    try {
      const block = await newRequestBlock(auth);
      if (block) return { success: false, error: { code: "billing_blocked", message: block } };
    } catch (error) {
      console.error("[intake] Free Requests check failed:", error);
      return { success: false, error: { code: "network", message: "Lane couldn’t check this workspace’s Free Requests. Try again." } };
    }
  }

  // The Request's saved prediction when editing: the definitions it already names may stay (#198).
  let storedImpact: unknown = null;
  if (existingRequestId !== undefined) {
    if (!z.uuid().safeParse(existingRequestId).success) return { success: false, error: { code: "validation", message: "Request unavailable." } };
    try {
      const [owned] = await db.select({ id: requests.id, expectedImpact: requests.expectedImpact }).from(requests).where(and(
        eq(requests.id, existingRequestId), changeable(auth), eq(requests.status, "open"),
      )).limit(1);
      if (!owned) return { success: false, error: { code: "validation", message: "Only the Requester or a workspace admin can edit an Open Request." } };
      storedImpact = owned.expectedImpact;
    } catch {
      return { success: false, error: { code: "network", message: `Couldn't check this Request. ${TEXT_KEPT}` } };
    }
  }
  // A Guest files without a prediction (#212); a Member who takes it on writes it.
  const parsed = (existingRequestId ? requestEditSourceSchema : newRequestSchemaFor(auth.role === "guest")).safeParse(formData);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = sourceFieldOf(issue.path);

    return {
      success: false,
      error: {
        code: "validation",
        message: issue.message,
        field,
      },
    };
  }

  try {
    if (!await canUseLabels(parsed.data.labelKeys, auth.orgId, parsed.data.projectId ?? null)) return {success:false,error:{code:"validation",field:"requestType",message:"A selected label belongs to a different Project or is unavailable. Remove it or restore its Project."}};
    if (!(await canUseProject(parsed.data.projectId, auth))) {
      return { success: false, error: { code: "validation", field: "projectId", message: "This Project is unavailable. Choose another Project or clear the selection." } };
    }
  } catch (error) {
    console.error("[intake] Project validation failed:", error);
    return { success: false, error: { code: "network", field: "projectId", message: "Lane couldn't check this Project. Try again." } };
  }
  // Every metric comes from this workspace's Metrics library, checked before any review is spent (#198).
  // A Guest's Request has no prediction to check (#212).
  let reviewed: RequestInput & z.output<typeof requestEditSourceSchema> = { expectedImpact: null, ...parsed.data };
  if (reviewed.expectedImpact?.kind === "measurement") {
    try {
      const checked = await checkPredictionMetrics(auth, reviewed.expectedImpact, storedImpact);
      if ("error" in checked) return { success: false, error: { code: "validation", field: "expectedImpact", message: checked.error } };
      reviewed = { ...reviewed, expectedImpact: checked.impact as typeof reviewed.expectedImpact };
    } catch (error) {
      console.error("[intake] Metrics library check failed:", error);
      return { success: false, error: { code: "network", field: "expectedImpact", message: "Lane couldn't check the metrics. Try again." } };
    }
  }

  const rateCheck = await checkAiRateLimit(auth.userId);
  if (!rateCheck.allowed) {
    if (rateCheck.reason === "unavailable") {
      return { success: false, error: TRIAGE_FAILURES.network };
    }
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(rateCheck.retryAfterMs / 1000)
    );
    return {
      success: false,
      error: {
        code: "rate_limited",
        message: `You’ve reached the review limit. Try again in ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
      },
    };
  }

  const outcome = await triageRequest({
    title: reviewed.title,
    description: reviewed.description,
  });
  if (!outcome.ok) {
    console.error("[intake] triage failed:", { kind: outcome.kind, statusCode: outcome.status, error: outcome.error });
    return { success: false, error: TRIAGE_FAILURES[outcome.kind] };
  }
  try {
    const token = createTriageToken(reviewed, outcome.triage, {
      orgId: auth.orgId,
      userId: auth.userId,
    }, existingRequestId);
    return { success: true, triage: outcome.triage, token };
  } catch (error) {
    // Signing failed (a missing secret): the review can't finish, as for a provider failure.
    console.error("[intake] triage token failed:", error);
    return { success: false, error: TRIAGE_FAILURES.provider };
  }
}

/**
 * Reviewers picked while creating a Request, checked with the same rules as
 * adding them from Request detail. They travel outside the signed review
 * token, so they are validated here on their own. Nothing is written yet.
 */
async function reviewersForNewRequest(
  input: unknown,
  auth: MemberAuth,
): Promise<{ reviewers: Reviewer[]; asked: ReviewNotification[] } | IntakeFailure> {
  const failure = (message: string): IntakeFailure => ({ code: "validation", field: "reviewers", message });
  const parsed = createReviewersSchema.safeParse(input);
  if (!parsed.success)
    return failure(parsed.error.issues.find((issue) => issue.path[0] === "note")?.message
      ?? reviewerPickRefusal((input as { nominees?: unknown } | null)?.nominees));
  const { nominees, note } = parsed.data ?? { nominees: [], note: "" };
  if (!nominees.length) return { reviewers: [], asked: [] };
  try {
    insist(auth.role !== "guest", "Guests can’t add reviewers.");
    return await appendReviewers({
      existing: [],
      nominees,
      note,
      auth,
      requesterId: auth.userId,
      roster: await workspaceRoster(auth.orgId),
    });
  } catch (error) {
    if (error instanceof RequestChangeError) return failure(error.message);
    console.error("[intake] reviewer check failed:", error);
    return { code: "network", field: "reviewers", message: "Lane couldn't check the reviewers. Try again." };
  }
}

export async function saveRequest(
  data: { token: string; editedProblemText: string | null },
  context: { orgId: string },
  reviewerInput?: unknown
): Promise<SaveResponse> {
  const auth = await requireCanContribute(context.orgId);
  if (!auth) return { success: false, error: await sessionFailure() };

  const guest = auth.role === "guest";
  const verification = verifyTriageToken(data.token, {
    orgId: auth.orgId,
    userId: auth.userId,
    withoutPrediction: guest,
  });
  if (!verification.valid) {
    if (verification.reason === "impact_required") {
      return { success: false, error: { code: "validation", field: "expectedImpact", message: "Set the goal, then review this Request again before creating it." } };
    }
    return {
      success: false,
      error: {
        code: "review_expired",
        message:
          "This review has expired. Your original Request is still here. Review it again to continue.",
      },
    };
  }

  let payload = verification.payload;
  // The classification and suggested change come from the signed review; only
  // the problem to solve is the person's own words.
  const saved = savedFraming(framingShape(payload.classification), {
    reframedProblem: data.editedProblemText,
    extractedSolution: payload.extractedSolution,
  }, "Describe the problem before creating this Request.");
  if (!saved.ok) {
    return {
      success: false,
      error: { code: "validation", message: saved.message, field: "editedProblemText" },
    };
  }
  const { reframedProblem, extractedSolution } = saved.framing;

  const review = await reviewersForNewRequest(reviewerInput, auth);
  if ("code" in review) return { success: false, error: review };

  try {
    if (!await canUseLabels(payload.labelKeys, auth.orgId, payload.projectId ?? null)) return {success:false,error:{code:"validation",field:"requestType",message:"A selected label belongs to a different Project or is unavailable. Remove it or restore its Project."}};
    if (!(await canUseProject(payload.projectId, auth))) {
      return { success: false, error: { code: "validation", field: "projectId", message: "This Project is unavailable. Return to your Request and choose another Project or clear the selection." } };
    }
    // A definition archived (or moved) since the review can't be newly picked (#198).
    if (payload.expectedImpact?.kind === "measurement") {
      const checked = await checkPredictionMetrics(auth, payload.expectedImpact);
      if ("error" in checked) return { success: false, error: { code: "validation", field: "expectedImpact", message: checked.error } };
      payload = { ...payload, expectedImpact: checked.impact as typeof payload.expectedImpact };
    }
    const insertRequest = (exec: typeof db | RequestTx) => exec
      .insert(requests)
      .values({
        id: payload.requestId,
        orgId: auth.orgId,
        projectId: payload.projectId,
        requestType: sourceRequestType(payload),
        labelKeys: payload.labelKeys,
        priority: payload.priority,
        // The choice is saved as its reason; a measured plan is saved as before (#153).
        ...impactColumnsOf(impactStateOfChoice(payload.expectedImpact)),
        title: payload.title,
        description: payload.description,
        ...storedContext(payload),
        classification: payload.classification,
        reframedProblem,
        extractedSolution,
        status: "open",
        assignedTo: null,
        createdBy: auth.userId,
        // #212: a Guest's Request waits as a Guest submission until a Member takes it on.
        guestSubmission: guest,
      })
      .onConflictDoNothing({ target: requests.id })
      .returning({ id: requests.id, requestNumber: requests.requestNumber, createdAt: requests.createdAt });
    // Reviewers and their notifications are written with the Request or not at all.
    // A retried save finds the Request already there and adds nobody twice.
    // While billing is enforced the Free Requests check shares the transaction; otherwise nothing is checked and a
    // Request with no Reviewers is one insert.
    const checked = !guest && billingEnforced();
    const outcome = !checked && !review.reviewers.length ? { rows: await insertRequest(db), block: null } : await db.transaction(async (tx): Promise<{ rows: Awaited<ReturnType<typeof insertRequest>>; block: string | null }> => {
      // #213: the check that counts, under the workspace lock that numbers new Requests. A retried save of a
      // Request already created goes on to find it below.
      const block = checked ? await newRequestBlock(auth, tx) : null;
      if (block) {
        const [already] = await tx.select({ id: requests.id }).from(requests)
          .where(and(eq(requests.id, payload.requestId), eq(requests.orgId, auth.orgId), eq(requests.createdBy, auth.userId)));
        return { rows: [], block: already ? null : block };
      }
      const rows = await insertRequest(tx);
      if (rows[0] && review.reviewers.length) {
        const request = { id: rows[0].id, orgId: auth.orgId };
        await tx.insert(requestAgreements).values({ orgId: auth.orgId, requestId: request.id, reviewers: review.reviewers });
        await notifyReviewers(tx, request, auth.userId, review.asked);
      }
      return { rows, block: null };
    });
    if (outcome.block) return { success: false, error: { code: "billing_blocked", message: outcome.block } };
    const [created] = outcome.rows;

    if (created) {
      revalidateSavedRequest(created.id);
      // #206: the Reviewers asked on a new Request hear about it after the response.
      if (review.reviewers.length) deliverAfterResponse({ orgId: auth.orgId, requestId: created.id });
      return { success: true, requestId: created.id, created: savedListRow(created, payload, reframedProblem) };
    }

    const [existing] = await db
      .select({ id: requests.id, requestNumber: requests.requestNumber, createdAt: requests.createdAt })
      .from(requests)
      .where(
        and(
          eq(requests.id, payload.requestId),
          eq(requests.orgId, auth.orgId),
          eq(requests.createdBy, auth.userId)
        )
      )
      .limit(1);

    if (existing) {
      revalidateSavedRequest(existing.id);
      return { success: true, requestId: existing.id, created: savedListRow(existing, payload, reframedProblem) };
    }

    return {
      success: false,
      error: {
        code: "save_failed",
        message:
          `Your Request couldn't be created. ${TEXT_KEPT} Try again.`,
      },
    };
  } catch (error) {
    console.error("[intake] save failed:", error);
    return {
      success: false,
      error: {
        code: "save_failed",
        message:
          `Your Request couldn't be created. ${TEXT_KEPT} Try again.`,
      },
    };
  }
}
