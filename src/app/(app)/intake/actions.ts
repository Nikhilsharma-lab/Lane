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
  classifyTriageFailure,
  triageFailureStatus,
  triageRequest,
  type TriageFailureKind,
  type TriageResult,
} from "@/lib/ai/triage";
import { canUseProject } from "@/lib/project-access";
import type { RequestType } from "@/lib/request-properties";
import { requireActiveMember, type MemberAuth } from "@/lib/auth-guard";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { requestSchema, sourceFieldOf, storedContext, type RequestInput, type RequestSourceField } from "@/lib/request-schema";
import { framingShape, savedFraming } from "@/lib/request-framing";
import { createTriageToken, verifyTriageToken } from "@/lib/triage-token";
import { createReviewersSchema, type Reviewer } from "@/lib/request-reviewer-rules";
import { workspaceRoster } from "@/lib/workspace-roster";
import { RequestChangeError, insist, type RequestTx } from "@/lib/request-change-store";
import { appendReviewers, notifyReviewers, type ReviewNotification } from "@/lib/request-reviewers";

export type IntakeFailureCode =
  | "validation"
  | "session_expired"
  | "rate_limited"
  | "timeout"
  | "network"
  | "provider"
  | "malformed"
  | "review_expired"
  | "save_failed";

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
const REVIEW_UNAVAILABLE = "Review unavailable right now. Your draft is kept.";
const TRIAGE_FAILURES: Record<TriageFailureKind, IntakeFailure> = {
  timeout: { code: "timeout", message: REVIEW_UNAVAILABLE },
  rate_limited: { code: "provider", message: REVIEW_UNAVAILABLE },
  malformed: { code: "malformed", message: REVIEW_UNAVAILABLE },
  network: { code: "network", message: REVIEW_UNAVAILABLE },
  provider: { code: "provider", message: REVIEW_UNAVAILABLE },
};

function sessionFailure(): IntakeFailure {
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
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionFailure() };

  if (existingRequestId !== undefined) {
    if (!z.uuid().safeParse(existingRequestId).success) return { success: false, error: { code: "validation", message: "Request unavailable." } };
    try {
      const [owned] = await db.select({ id: requests.id }).from(requests).where(and(
        eq(requests.id, existingRequestId), changeable(auth), eq(requests.status, "open"),
      )).limit(1);
      if (!owned) return { success: false, error: { code: "validation", message: "Only the creator or a workspace admin can edit an Open Request." } };
    } catch {
      return { success: false, error: { code: "network", message: "Could not check this Request. Your draft is kept." } };
    }
  }
  const parsed = (existingRequestId ? requestEditSourceSchema : requestSchema).safeParse(formData);
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
    return { success: false, error: { code: "network", field: "projectId", message: "Lane could not check this Project. Try again." } };
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

  try {
    const triage = await triageRequest({
      title: parsed.data.title,
      description: parsed.data.description,
    });
    const token = createTriageToken(parsed.data, triage, {
      orgId: auth.orgId,
      userId: auth.userId,
    }, existingRequestId);

    return { success: true, triage, token };
  } catch (error) {
    const kind = classifyTriageFailure(error);
    console.error("[intake] triage failed:", { kind, statusCode: triageFailureStatus(error), error });
    return { success: false, error: TRIAGE_FAILURES[kind] };
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
    return failure(parsed.error.issues.find((issue) => issue.path[0] === "note")?.message ?? "Choose people to review.");
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
    return { code: "network", field: "reviewers", message: "Lane could not check the reviewers. Try again." };
  }
}

export async function saveRequest(
  data: { token: string; editedProblemText: string | null },
  context: { orgId: string },
  reviewerInput?: unknown
): Promise<SaveResponse> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionFailure() };

  const verification = verifyTriageToken(data.token, {
    orgId: auth.orgId,
    userId: auth.userId,
  });
  if (!verification.valid) {
    if (verification.reason === "impact_required") {
      return { success: false, error: { code: "validation", field: "expectedImpact", message: "Add the expected impact, then review this Request again before creating it." } };
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

  const payload = verification.payload;
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
    const insertRequest = (exec: typeof db | RequestTx) => exec
      .insert(requests)
      .values({
        id: payload.requestId,
        orgId: auth.orgId,
        projectId: payload.projectId,
        requestType: sourceRequestType(payload),
        labelKeys: payload.labelKeys,
        priority: payload.priority,
        expectedImpact: payload.expectedImpact,
        title: payload.title,
        description: payload.description,
        ...storedContext(payload),
        classification: payload.classification,
        reframedProblem,
        extractedSolution,
        status: "open",
        assignedTo: null,
        createdBy: auth.userId,
      })
      .onConflictDoNothing({ target: requests.id })
      .returning({ id: requests.id, requestNumber: requests.requestNumber, createdAt: requests.createdAt });
    // Reviewers and their notifications are written with the Request or not at all.
    // A retried save finds the Request already there and adds nobody twice.
    const [created] = review.reviewers.length
      ? await db.transaction(async (tx) => {
        const rows = await insertRequest(tx);
        if (rows[0]) {
          const request = { id: rows[0].id, orgId: auth.orgId };
          await tx.insert(requestAgreements).values({ orgId: auth.orgId, requestId: request.id, reviewers: review.reviewers });
          await notifyReviewers(tx, request, auth.userId, review.asked);
        }
        return rows;
      })
      : await insertRequest(db);

    if (created) {
      revalidateSavedRequest(created.id);
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
          "Your Request could not be created. Your text is still here. Try again.",
      },
    };
  } catch (error) {
    console.error("[intake] save failed:", error);
    return {
      success: false,
      error: {
        code: "save_failed",
        message:
          "Your Request could not be created. Your text is still here. Try again.",
      },
    };
  }
}
