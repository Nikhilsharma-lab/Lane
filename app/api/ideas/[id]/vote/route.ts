import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { ideas, ideaVotes, profiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// POST /api/ideas/[id]/vote — upvote or downvote; toggle off if same vote
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ideaId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId));
  if (!idea || idea.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const body = await req.json();
  const { voteType } = body; // 'upvote' | 'downvote'

  if (voteType !== "upvote" && voteType !== "downvote") {
    return NextResponse.json({ error: "voteType must be 'upvote' or 'downvote'" }, { status: 400 });
  }

  // Check for existing vote
  const [existing] = await db
    .select()
    .from(ideaVotes)
    .where(and(eq(ideaVotes.ideaId, ideaId), eq(ideaVotes.voterId, user.id)));

  if (existing) {
    if (existing.voteType === voteType) {
      // Same vote → toggle off (delete)
      await db.delete(ideaVotes).where(eq(ideaVotes.id, existing.id));
      return NextResponse.json({ action: "removed" });
    } else {
      // Different vote → update
      await db
        .update(ideaVotes)
        .set({ voteType })
        .where(eq(ideaVotes.id, existing.id));
      return NextResponse.json({ action: "changed", voteType });
    }
  }

  // New vote
  await db.insert(ideaVotes).values({ ideaId, voterId: user.id, voteType });
  return NextResponse.json({ action: "added", voteType });
}
