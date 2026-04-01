import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { ideas, ideaVotes, profiles } from "@/db/schema";
import { eq, sql, desc, asc } from "drizzle-orm";

// GET /api/ideas — list ideas for the user's org with vote counts
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // filter by status
  const sort = searchParams.get("sort") ?? "net_score"; // net_score | newest | ending_soon

  // Aggregate vote counts alongside ideas
  const rows = await db
    .select({
      id: ideas.id,
      orgId: ideas.orgId,
      authorId: ideas.authorId,
      isAnonymous: ideas.isAnonymous,
      title: ideas.title,
      problem: ideas.problem,
      proposedSolution: ideas.proposedSolution,
      category: ideas.category,
      impactEstimate: ideas.impactEstimate,
      effortEstimateWeeks: ideas.effortEstimateWeeks,
      targetUsers: ideas.targetUsers,
      status: ideas.status,
      votingEndsAt: ideas.votingEndsAt,
      linkedRequestId: ideas.linkedRequestId,
      createdAt: ideas.createdAt,
      upvotes: sql<number>`count(case when ${ideaVotes.voteType} = 'upvote' then 1 end)::int`,
      downvotes: sql<number>`count(case when ${ideaVotes.voteType} = 'downvote' then 1 end)::int`,
      netScore: sql<number>`count(case when ${ideaVotes.voteType} = 'upvote' then 1 end)::int - count(case when ${ideaVotes.voteType} = 'downvote' then 1 end)::int`,
      userVote: sql<string | null>`max(case when ${ideaVotes.voterId} = ${user.id} then ${ideaVotes.voteType} end)`,
    })
    .from(ideas)
    .leftJoin(ideaVotes, eq(ideaVotes.ideaId, ideas.id))
    .where(
      status
        ? sql`${ideas.orgId} = ${profile.orgId} and ${ideas.status} = ${status}`
        : eq(ideas.orgId, profile.orgId)
    )
    .groupBy(ideas.id)
    .orderBy(
      sort === "newest"
        ? desc(ideas.createdAt)
        : sort === "ending_soon"
        ? asc(ideas.votingEndsAt)
        : sql`count(case when ${ideaVotes.voteType} = 'upvote' then 1 end)::int - count(case when ${ideaVotes.voteType} = 'downvote' then 1 end)::int desc`
    );

  return NextResponse.json(rows);
}

// POST /api/ideas — create a new idea
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json();
  const { title, problem, proposedSolution, category, impactEstimate, effortEstimateWeeks, targetUsers, isAnonymous } = body;

  if (!title || !problem || !proposedSolution || !category) {
    return NextResponse.json({ error: "title, problem, proposedSolution, and category are required" }, { status: 400 });
  }

  const votingEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

  const [idea] = await db
    .insert(ideas)
    .values({
      orgId: profile.orgId,
      authorId: user.id,
      isAnonymous: isAnonymous ?? false,
      title,
      problem,
      proposedSolution,
      category,
      impactEstimate: impactEstimate ?? null,
      effortEstimateWeeks: effortEstimateWeeks ?? null,
      targetUsers: targetUsers ?? null,
      votingEndsAt,
    })
    .returning();

  return NextResponse.json(idea, { status: 201 });
}
