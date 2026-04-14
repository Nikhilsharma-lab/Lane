// app/api/requests/[id]/impact-retrospective/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { withUserSession } from "@/db/user";
import { requests, profiles, comments, impactRecords, impactRetrospectives } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateImpactRetrospective } from "@/lib/ai/impact-retrospective";
import { checkAiRateLimit } from "@/lib/rate-limit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return withUserDb(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.orgId !== profile.orgId) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const [record] = await db
      .select()
      .from(impactRetrospectives)
      .where(eq(impactRetrospectives.requestId, requestId));

    return NextResponse.json({ retrospective: record ?? null });
  });
}

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
      .from(impactRetrospectives)
      .where(eq(impactRetrospectives.requestId, requestId));
    if (existing) return NextResponse.json({ retrospective: existing });

    // Guard: needs actual impact logged and track stage complete
    if (!request.impactActual || !request.impactMetric || !request.impactPrediction) {
      return NextResponse.json(
        { error: "Requires impactMetric, impactPrediction, and impactActual" },
        { status: 400 }
      );
    }
    if (request.trackStage !== "complete") {
      return NextResponse.json(
        { error: "Track stage must be complete before generating retrospective" },
        { status: 400 }
      );
    }

    // Fetch variance from impact_records
    const [impactRecord] = await db
      .select()
      .from(impactRecords)
      .where(eq(impactRecords.requestId, requestId));

    const variancePercent =
      impactRecord?.variancePercent !== null && impactRecord?.variancePercent !== undefined
        ? parseFloat(impactRecord.variancePercent as string)
        : null;

    // Fetch comments
    const rawComments = await db
      .select()
      .from(comments)
      .where(and(eq(comments.requestId, requestId), eq(comments.isSystem, false)));

    const authorIds = [
      ...new Set(rawComments.map((c) => c.authorId).filter(Boolean)),
    ] as string[];

    const authorLookup: Record<string, string> = {};
    if (authorIds.length) {
      const authorProfiles = await db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(inArray(profiles.id, authorIds));
      for (const p of authorProfiles) {
        if (p.id) authorLookup[p.id] = p.fullName ?? "Unknown";
      }
    }

    const formattedComments = rawComments.map((c) => ({
      body: c.body,
      authorName: c.authorId ? (authorLookup[c.authorId] ?? "Unknown") : "Unknown",
    }));

    try {
      const result = await generateImpactRetrospective({
        title: request.title,
        description: request.description,
        businessContext: request.businessContext,
        impactMetric: request.impactMetric,
        impactPrediction: request.impactPrediction,
        impactActual: request.impactActual,
        variancePercent,
        comments: formattedComments,
      });

      const inserted = await db
        .insert(impactRetrospectives)
        .values({
          requestId,
          headline: result.headline,
          whatHappened: result.whatHappened,
          likelyReasons: result.likelyReasons,
          nextTimeSuggestion: result.nextTimeSuggestion,
          celebrate: result.celebrate ?? null,
          aiModel: "claude-haiku-4-5-20251001",
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        const [race] = await db
          .select()
          .from(impactRetrospectives)
          .where(eq(impactRetrospectives.requestId, requestId));
        return NextResponse.json({ retrospective: race });
      }

      return NextResponse.json({ retrospective: inserted[0] });
    } catch (err) {
      console.error("[impact-retrospective] AI error:", err);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
  });
}
