import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, requestAiAnalysis, profiles, requestStages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { triageRequest } from "@/lib/ai/triage";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json();
  const { title, description, businessContext, successMetrics, deadlineAt } = body;

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
  }

  // Create request
  const [request] = await db
    .insert(requests)
    .values({
      orgId: profile.orgId,
      requesterId: profile.id,
      title: title.trim(),
      description: description.trim(),
      businessContext: businessContext?.trim() || null,
      successMetrics: successMetrics?.trim() || null,
      deadlineAt: deadlineAt ? new Date(deadlineAt) : null,
      status: "submitted",
      stage: "intake",
    })
    .returning();

  // Record intake stage entry
  await db.insert(requestStages).values({
    requestId: request.id,
    stage: "intake",
  });

  // Run AI triage
  let triage = null;
  try {
    const result = await triageRequest({
      title: request.title,
      description: request.description,
      businessContext: request.businessContext,
      successMetrics: request.successMetrics,
      deadline: deadlineAt ?? null,
    });

    const [saved] = await db
      .insert(requestAiAnalysis)
      .values({
        requestId: request.id,
        priority: result.priority,
        complexity: result.complexity,
        requestType: result.requestType,
        qualityScore: result.qualityScore,
        qualityFlags: result.qualityFlags,
        summary: result.summary,
        reasoning: result.reasoning,
        suggestions: result.suggestions,
        aiModel: "claude-3-5-haiku-20241022",
      })
      .returning();

    // Update request with AI-determined values
    await db
      .update(requests)
      .set({
        priority: result.priority,
        complexity: result.complexity,
        requestType: result.requestType,
        status: "triaged",
        updatedAt: new Date(),
      })
      .where(eq(requests.id, request.id));

    triage = saved;
  } catch (err) {
    console.error("AI triage failed:", err);
    // Request is still created, just without triage
  }

  return NextResponse.json({ request, triage }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const results = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .orderBy(requests.createdAt);

  return NextResponse.json({ requests: results });
}
