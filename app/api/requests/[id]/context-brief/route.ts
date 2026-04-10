// app/api/requests/[id]/context-brief/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, requestContextBriefs } from "@/db/schema";
import { eq, ne, and, desc } from "drizzle-orm";
import { generateContextBrief } from "@/lib/ai/context-brief";
import { checkAiRateLimit } from "@/lib/rate-limit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Return existing brief if already generated
  const [existing] = await db
    .select()
    .from(requestContextBriefs)
    .where(eq(requestContextBriefs.requestId, requestId));

  if (existing) {
    return NextResponse.json({ brief: existing });
  }

  try {
    // Fetch last 20 org requests (excluding this one) for related work detection
    const pastRequests = await db
      .select({ id: requests.id, title: requests.title, description: requests.description })
      .from(requests)
      .where(and(eq(requests.orgId, profile.orgId), ne(requests.id, requestId)))
      .orderBy(desc(requests.createdAt))
      .limit(20);

    const result = await generateContextBrief({
      title: request.title,
      description: request.description,
      businessContext: request.businessContext,
      successMetrics: request.successMetrics,
      deadlineAt: request.deadlineAt?.toISOString() ?? null,
      requestType: request.requestType,
      pastRequests,
    });

    const inserted = await db
      .insert(requestContextBriefs)
      .values({
        requestId,
        plainSummary: result.plainSummary,
        relatedRequests: result.relatedRequests,
        keyConstraints: result.keyConstraints,
        questionsToAsk: result.questionsToAsk,
        explorationDirections: result.explorationDirections,
        aiModel: "claude-3-5-haiku-20241022",
      })
      .onConflictDoNothing()
      .returning();

    // If conflict occurred (concurrent request already inserted), fetch the existing row
    if (inserted.length === 0) {
      const [existing] = await db
        .select()
        .from(requestContextBriefs)
        .where(eq(requestContextBriefs.requestId, requestId));
      return NextResponse.json({ brief: existing });
    }

    return NextResponse.json({ brief: inserted[0] });
  } catch (err) {
    console.error("[context-brief] AI error:", err);
    return NextResponse.json({ error: "Brief generation failed" }, { status: 500 });
  }
}
