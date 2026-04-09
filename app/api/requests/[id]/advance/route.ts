import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, requestStages, comments, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

const STAGES = [
  "intake", "context", "shape", "bet", "explore", "validate", "handoff", "build", "impact",
] as const;
type Stage = (typeof STAGES)[number];

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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const role = profile.role as "pm" | "designer" | "developer" | "lead" | "admin" | null;
  const canAdvance =
    request.requesterId === user.id ||
    role === "pm" ||
    role === "lead" ||
    role === "admin";
  if (!canAdvance) {
    return NextResponse.json(
      { error: "Only the requester, a PM, lead, or admin can advance stages" },
      { status: 403 }
    );
  }

  const currentIndex = STAGES.indexOf(request.stage as Stage);
  if (currentIndex === -1 || currentIndex >= STAGES.length - 1) {
    return NextResponse.json({ error: "Already at final stage" });
  }

  const nextStage = STAGES[currentIndex + 1];

  try {
    await db.insert(requestStages).values({
      requestId,
      stage: request.stage as Stage,
      completedAt: new Date(),
      completedById: user.id,
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
    console.error("[advance] DB error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
