"use server";

import type { OverviewRequest } from "@/lib/request-overview";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, requests } from "@/db";
import {
  classifyTriageFailure,
  triageRequest,
  type TriageFailureKind,
  type TriageResult,
} from "@/lib/ai/triage";
import { canUseProject } from "@/lib/project-access";
import type { RequestType } from "@/lib/request-properties";
import { requireActiveMember } from "@/lib/auth-guard";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { editedProblemSchema, requestSchema, type RequestInput } from "@/lib/request-schema";
import { createTriageToken, verifyTriageToken } from "@/lib/triage-token";

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
    | "expectedImpact"
    | "projectId"
    | "requestType"
    | "title"
    | "description"
    | "affectedPeople"
    | "desiredChange"
    | "observedEvidence"
    | "uncertainty"
    | "usefulLink"
    | "editedProblemText";
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
  payload: { title: string; projectId: string | null; requestType: OverviewRequest["requestType"] },
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
    priority: "none",
  };
}

const TRIAGE_FAILURES: Record<TriageFailureKind, IntakeFailure> = {
  timeout: {
    code: "timeout",
    message:
      "The review took too long. Your draft is still here. Try again.",
  },
  rate_limited: {
    code: "rate_limited",
    message:
      "Lane is busy right now. Wait a moment, then try again.",
  },
  malformed: {
    code: "malformed",
    message:
      "Lane could not prepare the review. Your draft is still here. Try again.",
  },
  network: {
    code: "network",
    message:
      "The review is unavailable right now. Your draft is still here. Try again shortly.",
  },
  provider: {
    code: "provider",
    message:
      "The review is unavailable right now. Your draft is still here. Try again shortly.",
  },
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
    title: string;
    description: string;
    affectedPeople?: string;
    desiredChange?: string;
    observedEvidence?: string;
    uncertainty?: string;
    usefulLink?: string;
  },
  context: { orgId: string }
): Promise<TriageResponse> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionFailure() };

  const parsed = requestSchema.safeParse(formData);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field =
      typeof issue.path[0] === "string" &&
      [
        "expectedImpact",
        "projectId",
        "requestType",
        "title",
        "description",
        "affectedPeople",
        "desiredChange",
        "observedEvidence",
        "uncertainty",
        "usefulLink",
      ].includes(issue.path[0])
        ? (issue.path[0] as IntakeFailure["field"])
        : undefined;

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
    if (!(await canUseProject(parsed.data.projectId, auth))) {
      return { success: false, error: { code: "validation", field: "projectId", message: "This Project is unavailable. Choose another Project or clear the selection." } };
    }
  } catch (error) {
    console.error("[intake] Project validation failed:", error);
    return { success: false, error: { code: "network", field: "projectId", message: "Lane could not check this Project. Try again." } };
  }

  const rateCheck = await checkAiRateLimit(auth.userId);
  if (!rateCheck.allowed) {
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
    });

    return { success: true, triage, token };
  } catch (error) {
    const kind = classifyTriageFailure(error);
    console.error("[intake] triage failed:", { kind, error });
    return { success: false, error: TRIAGE_FAILURES[kind] };
  }
}

export async function saveRequest(
  data: { token: string; editedProblemText: string | null },
  context: { orgId: string }
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
  const parsedEdit = editedProblemSchema.safeParse(data.editedProblemText);
  if (!parsedEdit.success) {
    return {
      success: false,
      error: {
        code: "validation",
        message: parsedEdit.error.issues[0].message,
        field: "editedProblemText",
      },
    };
  }

  if (payload.classification !== "problem" && parsedEdit.data === null) {
    return {
      success: false,
      error: {
        code: "validation",
        message: "Describe the problem before creating this Request.",
        field: "editedProblemText",
      },
    };
  }

  const reframedProblem =
    payload.classification === "problem" ? null : parsedEdit.data;

  try {
    if (!(await canUseProject(payload.projectId, auth))) {
      return { success: false, error: { code: "validation", field: "projectId", message: "This Project is unavailable. Return to your Request and choose another Project or clear the selection." } };
    }
    const [created] = await db
      .insert(requests)
      .values({
        id: payload.requestId,
        orgId: auth.orgId,
        projectId: payload.projectId,
        requestType: payload.requestType,
        expectedImpact: payload.expectedImpact,
        title: payload.title,
        description: payload.description,
        affectedPeople: payload.affectedPeople || null,
        desiredChange: payload.desiredChange || null,
        observedEvidence: payload.observedEvidence || null,
        uncertainty: payload.uncertainty || null,
        usefulLink: payload.usefulLink || null,
        classification: payload.classification,
        reframedProblem,
        extractedSolution: payload.extractedSolution,
        status: "open",
        assignedTo: null,
        createdBy: auth.userId,
      })
      .onConflictDoNothing({ target: requests.id })
      .returning({ id: requests.id, requestNumber: requests.requestNumber, createdAt: requests.createdAt });

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
