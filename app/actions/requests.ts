"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { comments, requests, requestStages } from "@/db/schema";
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

  revalidatePath(`/dashboard/requests/${requestId}`);
  revalidatePath("/dashboard");
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
