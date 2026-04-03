import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, ideas, ideaVotes, projects } from "@/db/schema";
import { eq, sql, and, isNull } from "drizzle-orm";
import { IdeaBoard } from "@/components/ideas/idea-board";

export default async function IdeasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));

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

  // activeProjects is fetched but not used in JSX (shell provides nav)
  void activeProjects;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Idea Board</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Anyone can submit ideas. Org votes. Top ideas get validated and become requests.</p>
      </div>

      <IdeaBoard initialIdeas={ideasWithAuthors} profileRole={profile.role ?? "member"} />
    </main>
  );
}
