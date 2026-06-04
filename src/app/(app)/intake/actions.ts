"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { triageRequest, type TriageResult } from "@/lib/ai/triage";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db, requests } from "@/db";

const requestSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters").max(5000),
});

export type TriageResponse =
  | { success: true; triage: TriageResult }
  | { success: false; error: string };

export type SaveResponse =
  | { success: true; requestId: string }
  | { success: false; error: string };

/**
 * Step 1: Run AI triage on the request — classify and possibly reframe.
 * Does NOT save to the database. The user must confirm first.
 */
export async function runTriage(formData: {
  title: string;
  description: string;
}): Promise<TriageResponse> {
  const parsed = requestSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const workspace = await ensureWorkspace();
  if (!workspace) {
    return { success: false, error: "You must be signed in." };
  }

  const rateCheck = checkAiRateLimit(workspace.userId);
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
    return { success: true, triage };
  } catch (err) {
    console.error("[intake] triage failed:", err);
    return { success: false, error: "AI analysis failed. Please try again." };
  }
}

/**
 * Step 2: Save the confirmed request to the database.
 * Called after the user accepts the AI classification/reframing.
 */
export async function saveRequest(data: {
  title: string;
  description: string;
  classification: "problem" | "solution" | "hybrid";
  reframedProblem: string | null;
  extractedSolution: string | null;
}): Promise<SaveResponse> {
  const workspace = await ensureWorkspace();
  if (!workspace) {
    return { success: false, error: "You must be signed in." };
  }

  try {
    const [created] = await db
      .insert(requests)
      .values({
        orgId: workspace.orgId,
        title: data.title,
        description: data.description,
        classification: data.classification,
        reframedProblem: data.reframedProblem,
        extractedSolution: data.extractedSolution,
        status: "open",
        assignedTo: null,
        createdBy: workspace.userId,
      })
      .returning({ id: requests.id });

    return { success: true, requestId: created.id };
  } catch (err) {
    console.error("[intake] save failed:", err);
    return { success: false, error: "Failed to save request. Please try again." };
  }
}
