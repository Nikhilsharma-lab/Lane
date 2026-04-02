import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, ideas, ideaVotes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { UserMenu } from "@/components/settings/user-menu";
import { IdeaBoard } from "@/components/ideas/idea-board";

export default async function IdeasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  // Fetch org members for author names
  const orgMembers = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));
  const memberMap = Object.fromEntries(orgMembers.map((m) => [m.id, m.fullName ?? "Unknown"]));

  // Fetch ideas with vote aggregates
  const rows = await db
    .select({
      id: ideas.id,
      authorId: ideas.authorId,
      isAnonymous: ideas.isAnonymous,
      title: ideas.title,
      problem: ideas.problem,
      category: ideas.category,
      status: ideas.status,
      effortEstimateWeeks: ideas.effortEstimateWeeks,
      votingEndsAt: ideas.votingEndsAt,
      upvotes: sql<number>`count(case when ${ideaVotes.voteType} = 'upvote' then 1 end)::int`,
      downvotes: sql<number>`count(case when ${ideaVotes.voteType} = 'downvote' then 1 end)::int`,
      netScore: sql<number>`count(case when ${ideaVotes.voteType} = 'upvote' then 1 end)::int - count(case when ${ideaVotes.voteType} = 'downvote' then 1 end)::int`,
      userVote: sql<string | null>`max(case when ${ideaVotes.voterId} = ${user.id} then ${ideaVotes.voteType} end)`,
    })
    .from(ideas)
    .leftJoin(ideaVotes, eq(ideaVotes.ideaId, ideas.id))
    .where(eq(ideas.orgId, profile.orgId))
    .groupBy(ideas.id)
    .orderBy(sql`count(case when ${ideaVotes.voteType} = 'upvote' then 1 end)::int - count(case when ${ideaVotes.voteType} = 'downvote' then 1 end)::int desc`);

  const ideasWithAuthors = rows.map((row) => ({
    ...row,
    votingEndsAt: row.votingEndsAt instanceof Date ? row.votingEndsAt.toISOString() : String(row.votingEndsAt),
    authorName: memberMap[row.authorId] ?? "Unknown",
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">DesignQ</span>
          <span className="text-zinc-700">·</span>
          <nav className="flex items-center gap-1">
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors">
              Requests
            </Link>
            <Link href="/dashboard/team" className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors">
              Team
            </Link>
            <Link href="/dashboard/insights" className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors">
              Insights
            </Link>
            <Link href="/dashboard/ideas" className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors">
              Ideas
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell />
          <span className="text-xs text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 capitalize">
            {profile.role}
          </span>
          <UserMenu fullName={profile.fullName} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Idea Board</h1>
          <p className="text-sm text-zinc-500 mt-1">Anyone can submit ideas. Org votes. Top ideas get validated and become requests.</p>
        </div>

        <IdeaBoard initialIdeas={ideasWithAuthors} profileRole={profile.role ?? "member"} />
      </main>
    </div>
  );
}
