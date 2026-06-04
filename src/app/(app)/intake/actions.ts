"use server";

import { z } from "zod";
import { triageRequest, type TriageResult } from "@/lib/ai/triage";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { createTriageToken, verifyTriageToken } from "@/lib/triage-token";
import { db, requests } from "@/db";

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

/**
 * Step 1: Run AI triage on the request — classify and possibly reframe.
 * Returns a signed token containing the trusted classification. The client
 * displays the triage result but cannot forge the classification on save.
 */
export async function runTriage(
  formData: { title: string; description: string },
  context: { userId: string; orgId: string }
): Promise<TriageResponse> {
  const parsed = requestSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const rateCheck = checkAiRateLimit(context.userId);
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

    // Sign the trusted triage result into a token
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

/**
 * Step 2: Save the confirmed request to the database.
 * Accepts ONLY the signed token + the user's edited problem text.
 * Classification and extractedSolution come from the verified token,
 * NEVER from the client.
 */
export async function saveRequest(
  data: { token: string; editedProblemText: string | null },
  context: { userId: string; orgId: string }
): Promise<SaveResponse> {
  // Verify the signed token — this is the gate enforcement
  const payload = verifyTriageToken(data.token);
  if (!payload) {
    return { success: false, error: "Invalid or expired triage token. Please resubmit." };
  }

  // Classification and extractedSolution come from the VERIFIED token
  const reframedProblem =
    payload.classification !== "problem" ? (data.editedProblemText || null) : null;

  try {
    const [created] = await db
      .insert(requests)
      .values({
        orgId: context.orgId,
        title: payload.title,
        description: payload.description,
        classification: payload.classification,
        reframedProblem,
        extractedSolution: payload.extractedSolution,
        status: "open",
        assignedTo: null,
        createdBy: context.userId,
      })
      .returning({ id: requests.id });

    return { success: true, requestId: created.id };
  } catch (err) {
    console.error("[intake] save failed:", err);
    return { success: false, error: "Failed to save request. Please try again." };
  }
}
