import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserSession } from "@/db/user";
import { ideas, ideaValidations, ideaVotes, profiles, requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateIdea, type IdeaValidationResult } from "@/lib/ai/idea-validator";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

// POST /api/ideas/[id]/validate — run AI validation, Design Head submits decision
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ideaId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const { decision, notes, impactScoreOverride, effortEstimateOverride, feasibilityScoreOverride, roiScoreOverride } = body;

  if (!decision || !["approved", "approved_with_conditions", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "decision must be approved, approved_with_conditions, or rejected" }, { status: 400 });
  }

  return withUserSession(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    if (profile.role !== "lead" && profile.role !== "admin") {
      return NextResponse.json({ error: "Only Design Head (lead/admin) can validate ideas" }, { status: 403 });
    }

    const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId));
    if (!idea || idea.orgId !== profile.orgId) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // Get vote counts for AI context
    const votes = await db.select().from(ideaVotes).where(eq(ideaVotes.ideaId, ideaId));
    const upvotes = votes.filter((v) => v.voteType === "upvote").length;
    const downvotes = votes.filter((v) => v.voteType === "downvote").length;

    // Run AI validation
    let aiScores: IdeaValidationResult;
    try {
      aiScores = await validateIdea({
        title: idea.title,
        problem: idea.problem,
        proposedSolution: idea.proposedSolution,
        category: idea.category,
        impactEstimate: idea.impactEstimate,
        effortEstimateWeeks: idea.effortEstimateWeeks,
        upvotes,
        downvotes,
      });
    } catch (err) {
      console.error("[idea-validate] AI error:", err);
      return NextResponse.json(
        { error: "Idea validation failed" },
        { status: 500 }
      );
    }

    // Use override values if provided, else AI scores
    const impactScore = impactScoreOverride ?? aiScores.impactScore;
    const effortEstimate = effortEstimateOverride ?? aiScores.effortEstimate;
    const feasibilityScore = feasibilityScoreOverride ?? aiScores.feasibilityScore;
    const roiScore = roiScoreOverride ?? aiScores.roiScore;

    let linkedRequestId: string | null = null;

    // If approved, auto-create a request in predesign phase
    if (decision === "approved" || decision === "approved_with_conditions") {
      const [newRequest] = await db
        .insert(requests)
        .values({
          orgId: profile.orgId,
          requesterId: user.id,
          title: idea.title,
          description: idea.problem,
          businessContext: idea.proposedSolution,
          successMetrics: idea.impactEstimate ?? null,
          phase: "predesign",
          predesignStage: "intake",
          stage: "intake",
          status: "submitted",
          linkedIdeaId: ideaId,
        })
        .returning({ id: requests.id });

      linkedRequestId = newRequest.id;

      // Update idea: status → approved, link to created request
      await db
        .update(ideas)
        .set({ status: decision, linkedRequestId: linkedRequestId, updatedAt: new Date() })
        .where(eq(ideas.id, ideaId));
    } else {
      // Rejected
      await db
        .update(ideas)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(ideas.id, ideaId));
    }

    // Notify idea author
    if (idea.authorId !== user.id) {
      const isApproved = decision === "approved" || decision === "approved_with_conditions";
      await createNotification(db, {
        orgId: profile.orgId,
        recipientId: idea.authorId,
        actorId: user.id,
        type: isApproved ? "idea_approved" : "idea_vote",
        title: isApproved
          ? `Your idea "${idea.title}" was approved!`
          : `Your idea "${idea.title}" was not approved`,
        body: isApproved
          ? "A new request has been created from your idea."
          : notes ?? "The idea was reviewed and not approved at this time.",
        url: "/dashboard/ideas",
      });
    }

    // Save validation record
    const [validation] = await db
      .insert(ideaValidations)
      .values({
        ideaId,
        validatedById: user.id,
        impactScore,
        effortEstimate,
        feasibilityScore,
        roiScore,
        decision,
        notes: notes ?? aiScores.reasoning,
        linkedRequestId,
      })
      .returning();

    return NextResponse.json({
      validation,
      aiScores,
      linkedRequestId,
    });
  });
}

// GET /api/ideas/[id]/validate — get AI scores without saving
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ideaId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  return withUserSession(user.id, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId));
    if (!idea || idea.orgId !== profile.orgId) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const votes = await db.select().from(ideaVotes).where(eq(ideaVotes.ideaId, ideaId));
    const upvotes = votes.filter((v) => v.voteType === "upvote").length;
    const downvotes = votes.filter((v) => v.voteType === "downvote").length;

    const aiScores = await validateIdea({
      title: idea.title,
      problem: idea.problem,
      proposedSolution: idea.proposedSolution,
      category: idea.category,
      impactEstimate: idea.impactEstimate,
      effortEstimateWeeks: idea.effortEstimateWeeks,
      upvotes,
      downvotes,
    });

    return NextResponse.json(aiScores);
  });
}
