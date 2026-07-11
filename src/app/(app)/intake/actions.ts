"use server";

import { triageRequest, type TriageResult } from "@/lib/ai/triage";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { createTriageToken, verifyTriageToken } from "@/lib/triage-token";
import { db, requests } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";
import { requestSchema, editedProblemSchema } from "@/lib/request-schema";

export type TriageResponse =
  | { success: true; triage: TriageResult; token: string }
  | { success: false; error: string };

export type SaveResponse =
  | { success: true; requestId: string }
  | { success: false; error: string };

export async function runTriage(
  formData: { title: string; description: string },
  context: { orgId: string }
): Promise<TriageResponse> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: "Not found" };

  const parsed = requestSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const rateCheck = await checkAiRateLimit(auth.userId);
  if (!rateCheck.allowed) {
    const seconds = Math.ceil(rateCheck.retryAfterMs / 1000);
    return {
      success: false,
      error: `Too many requests. Try again in ${seconds} seconds.`,
    };
  }

  try {
    const triage = await triageRequest({
      title: parsed.data.title,
      description: parsed.data.description,
    });

    const token = createTriageToken(
      parsed.data.title,
      parsed.data.description,
      triage
    );

    return { success: true, triage, token };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "AI analysis took too long. Please try again." };
    }
    console.error("[intake] triage failed:", err);
    return { success: false, error: "AI analysis failed. Please try again." };
  }
}

export async function saveRequest(
  data: { token: string; editedProblemText: string | null },
  context: { orgId: string }
): Promise<SaveResponse> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: "Not found" };

  const payload = verifyTriageToken(data.token);
  if (!payload) {
    return { success: false, error: "Invalid or expired triage token. Please resubmit." };
  }

  // The token locks classification, but editedProblemText arrives raw from the
  // client — enforce the same cap the form's textarea shows.
  const parsedEdit = editedProblemSchema.safeParse(data.editedProblemText);
  if (!parsedEdit.success) {
    return { success: false, error: parsedEdit.error.issues[0].message };
  }

  const reframedProblem =
    payload.classification !== "problem" ? (parsedEdit.data || null) : null;

  try {
    const [created] = await db
      .insert(requests)
      .values({
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
      .returning({ id: requests.id });

    return { success: true, requestId: created.id };
  } catch (err) {
    console.error("[intake] save failed:", err);
    return { success: false, error: "Failed to save request. Please try again." };
  }
}
