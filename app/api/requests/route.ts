import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserDb, withUserSession } from "@/db/user";
import { requests, requestAiAnalysis, profiles, requestStages, projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { triageRequest } from "@/lib/ai/triage";
import { checkAiRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const {
    title,
    description,
    businessContext,
    successMetrics,
    figmaUrl,
    impactMetric,
    impactPrediction,
    deadlineAt,
    projectId,
    submitJustification,
    aiClassifierResult,
    aiFlagged,
    aiExtractedProblem,
    aiExtractedSolution,
  } = body;

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "Project is required" }, { status: 400 });
  }

  return withUserSession(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Validate project belongs to same org
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, profile.orgId)));
    if (!project) {
      return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    }

    // --- Server-side triage (runs BEFORE insert) ---
    // Fetch recent org requests for duplicate detection.
    const existingRequests = await db
      .select({ id: requests.id, title: requests.title, description: requests.description })
      .from(requests)
      .where(eq(requests.orgId, profile.orgId))
      .orderBy(requests.createdAt)
      .limit(40);

    // --- Server-side triage (runs BEFORE insert) ---
    // Fail closed: if triage fails, the intake gate cannot be enforced, so we
    // refuse the request rather than fall back to client-provided AI fields.
    // Client-controlled classifier values are untrusted — a malicious client
    // could send `aiClassifierResult: "problem_framed"` to bypass the gate.
    let triageResult: Awaited<ReturnType<typeof triageRequest>>;
    try {
      triageResult = await triageRequest({
        title: title.trim(),
        description: description.trim(),
        businessContext: businessContext?.trim() || null,
        successMetrics: successMetrics?.trim() || null,
        deadline: deadlineAt ?? null,
        existingRequests,
      });
    } catch (err) {
      console.error("[requests/POST] Triage failed; refusing request to preserve intake gate:", err);
      return NextResponse.json(
        {
          error: "triage_unavailable",
          message:
            "Request classification is temporarily unavailable. Please retry in a moment.",
        },
        { status: 503 }
      );
    }

    // --- Server-side intake gate enforcement ---
    // Use only the server-computed classification. Client-provided AI fields
    // are persisted below for display, but NEVER used for gate decisions.
    const serverClassification = triageResult.classification;
    if (
      (serverClassification === "solution_specific" || serverClassification === "hybrid") &&
      (!submitJustification || !submitJustification.trim())
    ) {
      return NextResponse.json(
        {
          error: "intake_gate_blocked",
          message:
            "This request was classified as solution-specific. Reframe the problem or provide a justification.",
          classification: serverClassification,
        },
        { status: 400 }
      );
    }

    // --- Insert request with triage + AI fields in one write ---
    const [request] = await db
      .insert(requests)
      .values({
        orgId: profile.orgId,
        requesterId: profile.id,
        title: title.trim(),
        description: description.trim(),
        businessContext: businessContext?.trim() || null,
        successMetrics: successMetrics?.trim() || null,
        figmaUrl: figmaUrl?.trim() || null,
        impactMetric: impactMetric?.trim() || null,
        impactPrediction: impactPrediction?.trim() || null,
        deadlineAt: deadlineAt ? new Date(deadlineAt) : null,
        intakeJustification: submitJustification?.trim() || null,
        aiClassifierResult: triageResult?.classification || aiClassifierResult || null,
        aiFlagged:
          triageResult?.classification === "solution_specific" ||
          triageResult?.classification === "hybrid"
            ? triageResult.classification
            : aiFlagged || null,
        aiExtractedProblem: triageResult?.reframedProblem || aiExtractedProblem || null,
        aiExtractedSolution: triageResult?.extractedSolution || aiExtractedSolution || null,
        priority: triageResult?.priority ?? null,
        complexity: triageResult?.complexity ?? null,
        requestType: triageResult?.requestType ?? null,
        status: triageResult ? "triaged" : "submitted",
        stage: "intake",
        projectId,
      })
      .returning();

    // Record intake stage entry
    await db.insert(requestStages).values({
      requestId: request.id,
      stage: "intake",
    });

    // Insert AI analysis row (only if triage succeeded)
    let triage = null;
    if (triageResult) {
      const [saved] = await db
        .insert(requestAiAnalysis)
        .values({
          requestId: request.id,
          priority: triageResult.priority,
          complexity: triageResult.complexity,
          requestType: triageResult.requestType,
          qualityScore: triageResult.qualityScore,
          qualityFlags: triageResult.qualityFlags,
          summary: triageResult.summary,
          reasoning: triageResult.reasoning,
          suggestions: triageResult.suggestions,
          potentialDuplicates: triageResult.potentialDuplicates ?? [],
          aiModel: "claude-haiku-4-5-20251001",
        })
        .returning();
      triage = saved;
    }

    return NextResponse.json(
      {
        request,
        triage,
        triageStatus: "ok",
      },
      { status: 201 }
    );
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return withUserDb(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const results = await db
      .select()
      .from(requests)
      .where(eq(requests.orgId, profile.orgId))
      .orderBy(requests.createdAt);

    return NextResponse.json({ requests: results });
  });
}
