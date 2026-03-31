"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { comments, profiles, requests, requestStages } from "@/db/schema";
import { eq } from "drizzle-orm";

const STAGES = [
  "intake", "context", "shape", "bet", "explore", "validate", "handoff", "build", "impact",
] as const;
type Stage = typeof STAGES[number];

export { STAGES };
const STAGE_STATUS_MAP: Record<Stage, string> = {
  intake: "submitted",
  context: "triaged",
  shape: "triaged",
  bet: "assigned",
  explore: "in_progress",
  validate: "in_review",
  handoff: "in_review",
  build: "completed",
  impact: "shipped",
};

export async function updateRequest(
  requestId: string,
  data: {
    title: string;
    description: string;
    businessContext?: string | null;
    successMetrics?: string | null;
    figmaUrl?: string | null;
    impactMetric?: string | null;
    impactPrediction?: string | null;
    deadlineAt?: string | null;
  }
) {
  if (!data.title?.trim() || !data.description?.trim()) {
    return { error: "Title and description are required" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) return { error: "Request not found" };

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  const canEdit =
    request.requesterId === user.id ||
    profile?.role === "lead" ||
    profile?.role === "admin";
  if (!canEdit) return { error: "Only the requester or a lead can edit this request" };

  await db
    .update(requests)
    .set({
      title: data.title.trim(),
      description: data.description.trim(),
      businessContext: data.businessContext?.trim() || null,
      successMetrics: data.successMetrics?.trim() || null,
      figmaUrl: data.figmaUrl?.trim() || null,
      impactMetric: data.impactMetric?.trim() || null,
      impactPrediction: data.impactPrediction?.trim() || null,
      deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : null,
      updatedAt: new Date(),
    })
    .where(eq(requests.id, requestId));

  revalidatePath(`/dashboard/requests/${requestId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function addComment(requestId: string, body: string) {
  if (!body.trim()) return { error: "Comment cannot be empty" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  await db.insert(comments).values({
    requestId,
    authorId: user.id,
    body: body.trim(),
    isSystem: false,
  });

  revalidatePath(`/dashboard/requests/${requestId}`);
  return { success: true };
}

export async function advanceStage(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) return { error: "Request not found" };

  const currentIndex = STAGES.indexOf(request.stage as Stage);
  if (currentIndex === -1 || currentIndex >= STAGES.length - 1) {
    return { error: "Already at final stage" };
  }

  const nextStage = STAGES[currentIndex + 1];

  try {
    // Log current stage as completed
    await db.insert(requestStages).values({
      requestId,
      stage: request.stage as Stage,
      completedAt: new Date(),
      completedById: user.id,
    });

    // Advance stage and sync status
    await db
      .update(requests)
      .set({
        stage: nextStage,
        status: STAGE_STATUS_MAP[nextStage] as typeof requests.$inferSelect.status,
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));

    // System comment to surface movement in activity feed
    await db.insert(comments).values({
      requestId,
      authorId: null,
      body: `⭢ Moved to ${nextStage.charAt(0).toUpperCase() + nextStage.slice(1)} stage`,
      isSystem: true,
    });
  } catch (err) {
    console.error("[advanceStage] DB error:", err);
    return { error: "Database error — check server logs" };
  }

  revalidatePath(`/dashboard/requests/${requestId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function logImpact(requestId: string, impactActual: string) {
  if (!impactActual.trim()) return { error: "Actual impact cannot be empty" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  await db
    .update(requests)
    .set({
      impactActual: impactActual.trim(),
      impactLoggedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(requests.id, requestId));

  revalidatePath(`/dashboard/requests/${requestId}`);
  return { success: true };
}

export async function toggleBlocked(requestId: string, currentStatus: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) return { error: "Request not found" };

  const newStatus =
    currentStatus === "blocked"
      ? (STAGE_STATUS_MAP[request.stage as Stage] ?? "in_progress") // unblock
      : "blocked";

  await db
    .update(requests)
    .set({ status: newStatus as typeof requests.$inferSelect.status, updatedAt: new Date() })
    .where(eq(requests.id, requestId));

  revalidatePath(`/dashboard/requests/${requestId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function nudgeRequest(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return { error: "Profile not found" };

  try {
    await db.insert(comments).values({
      requestId,
      authorId: null,
      body: `🔔 Nudge sent by ${profile.fullName} — this request needs attention`,
      isSystem: true,
    });

    // Touch updatedAt so stall timer resets after nudge
    await db.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, requestId));
  } catch (err) {
    console.error("[nudgeRequest] DB error:", err);
    return { error: "Database error — check server logs" };
  }

  revalidatePath(`/dashboard/requests/${requestId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
