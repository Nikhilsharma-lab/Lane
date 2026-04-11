import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserSession } from "@/db/user";
import { requests, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { triageRequest } from "@/lib/ai/triage";
import { checkAiRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const { title, description, businessContext, successMetrics, impactMetric, impactPrediction } = body;

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
  }

  return withUserSession(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Fetch existing org requests for duplicate detection
    const existing = await db
      .select({ id: requests.id, title: requests.title, description: requests.description })
      .from(requests)
      .where(eq(requests.orgId, profile.orgId))
      .orderBy(desc(requests.createdAt))
      .limit(40);

    try {
      const result = await triageRequest({
        title: title.trim(),
        description: description.trim(),
        businessContext: businessContext?.trim() || null,
        successMetrics: successMetrics?.trim() || null,
        impactMetric: impactMetric?.trim() || null,
        impactPrediction: impactPrediction?.trim() || null,
        existingRequests: existing,
      });

      return NextResponse.json({
        qualityScore: result.qualityScore,
        qualityFlags: result.qualityFlags,
        suggestions: result.suggestions,
        potentialDuplicates: result.potentialDuplicates,
        classification: result.classification,
        reframedProblem: result.reframedProblem,
      });
    } catch (err) {
      console.error("[preflight] triage failed:", err);
      return NextResponse.json({ error: "preflight_failed" }, { status: 500 });
    }
  });
}
