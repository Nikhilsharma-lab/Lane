import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, cycles, cycleRequests, requests, projects } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { CycleDetail } from "@/components/cycles/cycle-detail";

export default async function CycleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/signup");

  const [cycle] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.id, params.id), eq(cycles.orgId, profile.orgId)));
  if (!cycle) notFound();

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, cycle.projectId));

  // Get requests in this cycle
  const crRows = await db
    .select({ requestId: cycleRequests.requestId })
    .from(cycleRequests)
    .where(eq(cycleRequests.cycleId, cycle.id));

  const requestIds = crRows.map((r) => r.requestId);

  const cycleReqs = requestIds.length
    ? await db
        .select({
          id: requests.id,
          title: requests.title,
          phase: requests.phase,
          priority: requests.priority,
          kanbanState: requests.kanbanState,
          trackStage: requests.trackStage,
        })
        .from(requests)
        .where(inArray(requests.id, requestIds))
    : [];

  // Count completed: phase = 'track' or (phase = 'dev' and kanbanState = 'done')
  const completedCount = cycleReqs.filter(
    (r) =>
      r.phase === "track" ||
      (r.phase === "dev" && r.kanbanState === "done")
  ).length;

  // All org requests for "add request" search
  const allOrgRequests = await db
    .select({ id: requests.id, title: requests.title })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <CycleDetail
        cycle={{
          id: cycle.id,
          name: cycle.name,
          status: cycle.status,
          appetiteWeeks: cycle.appetiteWeeks,
          startsAt: cycle.startsAt?.toISOString() ?? null,
          endsAt: cycle.endsAt?.toISOString() ?? null,
        }}
        projectName={project?.name ?? "Unknown"}
        projectColor={project?.color ?? "#71717a"}
        requests={cycleReqs}
        completedCount={completedCount}
        orgRequests={allOrgRequests}
      />
    </main>
  );
}
