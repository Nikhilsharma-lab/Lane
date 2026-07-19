"use server";

import { and, eq } from "drizzle-orm";

import { db, requests } from "@/db";
import {
  classifyTriageFailure,
  triageRequest,
  type TriageFailureKind,
  type TriageResult,
} from "@/lib/ai/triage";
import { requireActiveMember } from "@/lib/auth-guard";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { editedProblemSchema, requestSchema } from "@/lib/request-schema";
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
  field?: "title" | "description" | "editedProblemText";
  retryAfterSeconds?: number;
};

export type TriageResponse =
  | { success: true; triage: TriageResult; token: string }
  | { success: false; error: IntakeFailure };

export type SaveResponse =
  | { success: true; requestId: string }
  | { success: false; error: IntakeFailure };

const TRIAGE_FAILURES: Record<TriageFailureKind, IntakeFailure> = {
  timeout: {
    code: "timeout",
    message:
      "The framing check took longer than expected. Your request is still here. Try again.",
  },
  rate_limited: {
    code: "rate_limited",
    message:
      "The framing service is receiving too many requests. Wait a moment, then try again.",
  },
  malformed: {
    code: "malformed",
    message:
      "Lane could not read the framing result safely. Your request is still here. Run the check again.",
  },
  network: {
    code: "network",
    message:
      "Lane could not reach the framing service. Your request is still here. Try again.",
  },
  provider: {
    code: "provider",
    message:
      "The framing service is unavailable right now. Your request is still here. Try again shortly.",
  },
};

function sessionFailure(): IntakeFailure {
  return {
    code: "session_expired",
    message: "Your session ended. Sign in again to continue this Request.",
  };
}

export async function runTriage(
  formData: { title: string; description: string },
  context: { orgId: string }
): Promise<TriageResponse> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionFailure() };

  const parsed = requestSchema.safeParse(formData);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field =
      issue.path[0] === "title" || issue.path[0] === "description"
        ? issue.path[0]
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
        message: `You have checked several Requests quickly. Try again in ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
      },
    };
  }

  try {
    const triage = await triageRequest(parsed.data);
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
    return {
      success: false,
      error: {
        code: "review_expired",
        message:
          "This framing review has expired. Your original Request is still here. Review the framing again.",
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
        message: "Add a problem framing before creating this Request.",
        field: "editedProblemText",
      },
    };
  }

  const reframedProblem =
    payload.classification === "problem" ? null : parsedEdit.data;

  try {
    const [created] = await db
      .insert(requests)
      .values({
        id: payload.requestId,
        orgId: auth.orgId,
        title: payload.title,
        description: payload.description,
        classification: payload.classification,
        reframedProblem,
        extractedSolution: payload.extractedSolution,
        status: "open",
        assignedTo: null,
        createdBy: auth.userId,
      })
      .onConflictDoNothing({ target: requests.id })
      .returning({ id: requests.id });

    if (created) return { success: true, requestId: created.id };

    const [existing] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.id, payload.requestId),
          eq(requests.orgId, auth.orgId),
          eq(requests.createdBy, auth.userId)
        )
      )
      .limit(1);

    if (existing) return { success: true, requestId: existing.id };

    return {
      success: false,
      error: {
        code: "save_failed",
        message:
          "Lane could not create this Request. Your confirmed framing is still here. Try again.",
      },
    };
  } catch (error) {
    console.error("[intake] save failed:", error);
    return {
      success: false,
      error: {
        code: "save_failed",
        message:
          "Lane could not create this Request. Your confirmed framing is still here. Try again.",
      },
    };
  }
}
