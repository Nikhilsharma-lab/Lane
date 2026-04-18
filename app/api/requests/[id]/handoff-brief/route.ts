// app/api/requests/[id]/handoff-brief/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserSession } from "@/db/user";
import { requests, profiles, comments, requestHandoffBriefs, iterations, decisionLogEntries } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateHandoffBrief } from "@/lib/ai/handoff-brief";
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

  return withUserSession(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.orgId !== profile.orgId) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Return cached brief if already generated
    const [existing] = await db
      .select()
      .from(requestHandoffBriefs)
      .where(eq(requestHandoffBriefs.requestId, requestId));

    if (existing) return NextResponse.json({ brief: existing });

    try {
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

      const requestIterations = await db
        .select({
          title: iterations.title,
          description: iterations.description,
          rationale: iterations.rationale,
        })
        .from(iterations)
        .where(eq(iterations.requestId, requestId));

      const decisions = await db
        .select({
          title: decisionLogEntries.title,
          entryType: decisionLogEntries.entryType,
          rationale: decisionLogEntries.rationale,
        })
        .from(decisionLogEntries)
        .where(eq(decisionLogEntries.requestId, requestId));

      const result = await generateHandoffBrief({
        title: request.title,
        description: request.description,
        businessContext: request.businessContext,
        successMetrics: request.successMetrics,
        figmaUrl: request.figmaUrl,
        comments: formattedComments,
        sensingSummary: request.sensingSummary,
        designFrame: {
          problem: request.designFrameProblem,
          successCriteria: request.designFrameSuccessCriteria,
          constraints: request.designFrameConstraints,
          divergence: request.designFrameDivergence,
        },
        iterations: requestIterations,
        decisionLog: decisions,
        engineeringFeasibility: request.engineeringFeasibility,
      });

      const inserted = await db
        .insert(requestHandoffBriefs)
        .values({
          requestId,
          designDecisions: result.designDecisions,
          openQuestions: result.openQuestions,
          buildSequence: result.buildSequence,
          figmaNotes: result.figmaNotes,
          edgeCases: result.edgeCases,
          accessibilityGaps: result.accessibilityGaps,
          aiModel: "claude-haiku-4-5-20251001",
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        const [race] = await db
          .select()
          .from(requestHandoffBriefs)
          .where(eq(requestHandoffBriefs.requestId, requestId));
        return NextResponse.json({ brief: race });
      }

      return NextResponse.json({ brief: inserted[0] });
    } catch (err) {
      console.error("[handoff-brief] AI error:", err);
      return NextResponse.json({ error: "Brief generation failed" }, { status: 500 });
    }
  });
}
