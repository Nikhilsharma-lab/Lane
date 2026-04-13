// app/api/requests/[id]/enriched/route.ts
// Returns AI analysis, comments, stage history, context brief for the detail dock.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import {
  profiles,
  requests,
  comments,
  requestAiAnalysis,
  requestStages,
  requestContextBriefs,
  impactRetrospectives,
  projects,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return withUserDb(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
    if (!request || request.orgId !== profile.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

  let aiAnalysis = null;
  try {
    const [row] = await db
      .select()
      .from(requestAiAnalysis)
      .where(eq(requestAiAnalysis.requestId, requestId));
    aiAnalysis = row ?? null;
  } catch {
    // silent fail
  }

  let requestComments: (typeof comments.$inferSelect)[] = [];
  try {
    requestComments = await db
      .select()
      .from(comments)
      .where(eq(comments.requestId, requestId))
      .orderBy(comments.createdAt);
  } catch {
    // silent fail
  }

  let stageHistory: (typeof requestStages.$inferSelect)[] = [];
  try {
    stageHistory = await db
      .select()
      .from(requestStages)
      .where(eq(requestStages.requestId, requestId))
      .orderBy(requestStages.completedAt);
  } catch {
    // silent fail
  }

  let existingBrief = null;
  try {
    const [briefRow] = await db
      .select()
      .from(requestContextBriefs)
      .where(eq(requestContextBriefs.requestId, requestId));
    existingBrief = briefRow ?? null;
  } catch {
    // silent fail
  }

  // Build author map for comments
  const authorIds = [
    ...new Set(requestComments.map((c) => c.authorId).filter(Boolean)),
  ] as string[];
  let authorMap: Record<string, { fullName: string | null }> = {};
  if (authorIds.length) {
    try {
      const authorProfiles = await db
        .select()
        .from(profiles)
        .where(inArray(profiles.id, authorIds));
      authorMap = Object.fromEntries(
        authorProfiles.map((p) => [p.id, { fullName: p.fullName }])
      );
    } catch {
      // silent fail
    }
  }

  // Requester name
  let requesterName = "Unknown";
  if (request.requesterId) {
    try {
      const [requester] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, request.requesterId));
      if (requester) requesterName = requester.fullName ?? "Unknown";
    } catch {
      // silent fail
    }
  }

  // Project
  let project: { id: string; name: string; color: string } | null = null;
  if (request.projectId) {
    try {
      const [proj] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, request.projectId));
      if (proj) project = { id: proj.id, name: proj.name, color: proj.color };
    } catch {
      // silent fail
    }
  }

  // Impact retrospective (track phase only)
  let existingRetrospective = null;
  if (request.phase === "track") {
    try {
      const [retroRow] = await db
        .select()
        .from(impactRetrospectives)
        .where(eq(impactRetrospectives.requestId, requestId));
      existingRetrospective = retroRow ?? null;
    } catch {
      // silent fail
    }
  }

  // canEdit
  const canEdit =
    profile.id === request.requesterId ||
    profile.role === "lead" ||
    profile.role === "admin";

  return NextResponse.json({
    request,
    aiAnalysis,
    comments: requestComments,
    authorMap,
    stageHistory,
    existingBrief,
    existingRetrospective,
    requesterName,
    project,
    canEdit,
  });
  });
}
