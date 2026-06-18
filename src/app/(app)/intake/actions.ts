"use server";

import { z } from "zod";
import { triageRequest, type TriageResult } from "@/lib/ai/triage";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { createTriageToken, verifyTriageToken } from "@/lib/triage-token";
import { db, requests } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";

const requestSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters").max(5000),
});

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

  const rateCheck = checkAiRateLimit(auth.userId);
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

  const reframedProblem =
    payload.classification !== "problem" ? (data.editedProblemText || null) : null;

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
