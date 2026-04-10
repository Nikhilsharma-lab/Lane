"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { assignments, comments, proactiveAlerts, profiles, requests, requestStages } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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

async function getAuthedUserId() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

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

  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request) return { error: "Request not found" };
    if (request.orgId !== profile.orgId) return { error: "Request not found" };

    const canEdit =
      request.requesterId === userId ||
      profile.role === "lead" ||
      profile.role === "admin";
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

    revalidatePath("/dashboard");
    return { success: true };
  });
}

export async function addComment(requestId: string, body: string) {
  if (!body.trim()) return { error: "Comment cannot be empty" };

  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.orgId !== profile.orgId) return { error: "Request not found" };

    await db.insert(comments).values({
      requestId,
      authorId: userId,
      body: body.trim(),
      isSystem: false,
    });

    return { success: true };
  });
}

export async function advanceStage(requestId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request) return { error: "Request not found" };
    if (request.orgId !== profile.orgId) return { error: "Request not found" };

    const role = profile.role as "pm" | "designer" | "developer" | "lead" | "admin" | null;
    const canAdvance =
      request.requesterId === userId ||
      role === "pm" ||
      role === "lead" ||
      role === "admin";
    if (!canAdvance) return { error: "Only the requester, a PM, lead, or admin can advance stages" };

    const currentIndex = STAGES.indexOf(request.stage as Stage);
    if (currentIndex === -1 || currentIndex >= STAGES.length - 1) {
      return { error: "Already at final stage" };
    }

    const nextStage = STAGES[currentIndex + 1];

    try {
      await db.insert(requestStages).values({
        requestId,
        stage: request.stage as Stage,
        completedAt: new Date(),
        completedById: userId,
      });

      await db
        .update(requests)
        .set({
          stage: nextStage,
          status: STAGE_STATUS_MAP[nextStage] as typeof requests.$inferSelect.status,
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));

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

    revalidatePath("/dashboard");
    return { success: true };
  });
}

export async function logImpact(requestId: string, impactActual: string) {
  if (!impactActual.trim()) return { error: "Actual impact cannot be empty" };

  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.orgId !== profile.orgId) return { error: "Request not found" };

    await db
      .update(requests)
      .set({
        impactActual: impactActual.trim(),
        impactLoggedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));

    return { success: true };
  });
}

export async function toggleBlocked(requestId: string, currentStatus: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request) return { error: "Request not found" };
    if (request.orgId !== profile.orgId) return { error: "Request not found" };

    const role = profile.role as "pm" | "designer" | "developer" | "lead" | "admin" | null;
    if (role !== "lead" && role !== "admin") {
      return { error: "Only leads and admins can toggle blocked status" };
    }

    const newStatus =
      currentStatus === "blocked"
        ? (STAGE_STATUS_MAP[request.stage as Stage] ?? "in_progress")
        : "blocked";

    await db
      .update(requests)
      .set({ status: newStatus as typeof requests.$inferSelect.status, updatedAt: new Date() })
      .where(eq(requests.id, requestId));

    revalidatePath("/dashboard");
    return { success: true };
  });
}

export async function advanceToContext(requestId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    await db
      .update(requests)
      .set({
        predesignStage: "context",
        status: "triaged",
        updatedAt: new Date(),
      })
      .where(and(eq(requests.id, requestId), eq(requests.orgId, profile.orgId)));

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/intake");
    return { success: true };
  });
}

export async function declineRequest(requestId: string, reason: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    await db
      .update(requests)
      .set({ status: "blocked", updatedAt: new Date() })
      .where(and(eq(requests.id, requestId), eq(requests.orgId, profile.orgId)));

    await db.insert(comments).values({
      requestId,
      authorId: userId,
      body: `Request declined: ${reason}`,
      isSystem: true,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/intake");
    return { success: true };
  });
}

export async function snoozeRequest(requestId: string, untilIso: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    await db
      .update(requests)
      .set({
        snoozedUntil: new Date(untilIso),
        snoozedById: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(requests.id, requestId), eq(requests.orgId, profile.orgId)));

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/intake");
    return { success: true };
  });
}

export async function nudgeRequest(requestId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.orgId !== profile.orgId) return { error: "Request not found" };
    if (profile.role !== "lead" && profile.role !== "admin") {
      return { error: "Only leads and admins can send nudges" };
    }

    const designerAssignment = await db
      .select({ assigneeId: assignments.assigneeId })
      .from(assignments)
      .leftJoin(profiles, eq(profiles.id, assignments.assigneeId))
      .where(and(eq(assignments.requestId, requestId), eq(profiles.role, "designer")))
      .limit(1);

    const recipientId = designerAssignment[0]?.assigneeId ?? request.designerOwnerId;
    if (!recipientId) return { error: "No designer assigned — assign a designer first" };

    const today = new Date().toISOString().slice(0, 10);
    const ruleKey = `stall_nudge:${requestId}:${today}`;

    try {
      await db
        .insert(proactiveAlerts)
        .values({
          orgId: request.orgId,
          requestId,
          recipientId,
          type: "stall_nudge",
          urgency: "medium",
          title: "This request needs your attention",
          body: `Hey — it's been a while since "${request.title}" got some attention. Everything okay?`,
          ctaLabel: "View request",
          ctaUrl: `/requests/${requestId}`,
          ruleKey,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .onConflictDoNothing({ target: proactiveAlerts.ruleKey });

      await db.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, requestId));
    } catch (err) {
      console.error("[nudgeRequest] DB error:", err);
      return { error: "Database error — check server logs" };
    }

    revalidatePath("/dashboard");
    return { success: true };
  });
}
