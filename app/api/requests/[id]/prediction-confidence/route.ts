// app/api/requests/[id]/prediction-confidence/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserSession } from "@/db/user";
import { requests, profiles, predictionConfidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generatePredictionConfidence } from "@/lib/ai/prediction-confidence";
import { checkAiRateLimit } from "@/lib/rate-limit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  return withUserSession(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.orgId !== profile.orgId) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Return cached record if already generated
    const [existing] = await db
      .select()
      .from(predictionConfidence)
      .where(eq(predictionConfidence.requestId, requestId));
    if (existing) return NextResponse.json({ confidence: existing });

    // Guard: needs both fields to generate
    if (!request.impactMetric || !request.impactPrediction) {
      return NextResponse.json({ error: "Missing impactMetric or impactPrediction" }, { status: 400 });
    }

    try {
      const result = await generatePredictionConfidence({
        title: request.title,
        description: request.description,
        businessContext: request.businessContext,
        successMetrics: request.successMetrics,
        impactMetric: request.impactMetric,
        impactPrediction: request.impactPrediction,
        requestType: request.requestType,
        priority: request.priority,
      });

      const inserted = await db
        .insert(predictionConfidence)
        .values({
          requestId,
          score: result.score,
          label: result.label,
          rationale: result.rationale,
          redFlags: result.redFlags,
          suggestion: result.suggestion,
          aiModel: "claude-haiku-4-5-20251001",
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        const [race] = await db
          .select()
          .from(predictionConfidence)
          .where(eq(predictionConfidence.requestId, requestId));
        return NextResponse.json({ confidence: race });
      }

      return NextResponse.json({ confidence: inserted[0] });
    } catch (err) {
      console.error("[prediction-confidence] AI error:", err);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
  });
}
