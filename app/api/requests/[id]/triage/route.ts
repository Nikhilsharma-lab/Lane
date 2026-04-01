import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, requestAiAnalysis, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { triageRequest } from "@/lib/ai/triage";

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

  // Check if analysis already exists
  const [existing] = await db
    .select()
    .from(requestAiAnalysis)
    .where(eq(requestAiAnalysis.requestId, requestId));

  if (existing) {
    return NextResponse.json({ error: "Already triaged", analysis: existing });
  }

  try {
    // Fetch org requests for duplicate detection
    const orgRequests = await db
      .select({ id: requests.id, title: requests.title, description: requests.description })
      .from(requests)
      .where(eq(requests.orgId, profile.orgId))
      .orderBy(requests.createdAt)
      .limit(40);
    const existingRequests = orgRequests.filter((r) => r.id !== requestId);

    const result = await triageRequest({
      title: request.title,
      description: request.description,
      businessContext: request.businessContext,
      successMetrics: request.successMetrics,
      deadline: request.deadlineAt?.toISOString() ?? null,
      existingRequests,
    });

    const [saved] = await db
      .insert(requestAiAnalysis)
      .values({
        requestId,
        priority: result.priority,
        complexity: result.complexity,
        requestType: result.requestType,
        qualityScore: result.qualityScore,
        qualityFlags: result.qualityFlags,
        summary: result.summary,
        reasoning: result.reasoning,
        suggestions: result.suggestions,
        potentialDuplicates: result.potentialDuplicates ?? [],
        aiModel: "claude-3-5-haiku-20241022",
      })
      .returning();

    // Update request with AI-determined values if not already set
    if (!request.priority) {
      await db
        .update(requests)
        .set({
          priority: result.priority,
          complexity: result.complexity,
          requestType: result.requestType,
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));
    }

    return NextResponse.json({ success: true, analysis: saved });
  } catch (err) {
    console.error("[triage] AI error:", err);
    return NextResponse.json({ error: "AI triage failed — check server logs" }, { status: 500 });
  }
}
