import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, projects } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getCyclesForOrg } from "@/app/actions/cycles";
import { CycleCard } from "@/components/cycles/cycle-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateCycleForm } from "@/components/cycles/create-cycle-form";
import { Badge } from "@/components/ui/badge";

export default async function CyclesPage() {
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

  const allCycles = await getCyclesForOrg();
  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));

  // Group cycles by project
  const grouped: Record<
    string,
    { projectName: string; projectColor: string; cycles: typeof allCycles }
  > = {};

  for (const cycle of allCycles) {
    const key = cycle.projectId;
    if (!grouped[key]) {
      grouped[key] = {
        projectName: cycle.projectName ?? "Unknown",
        projectColor: cycle.projectColor ?? "#71717a",
        cycles: [],
      };
    }
    grouped[key].cycles.push(cycle);
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Cycles
          </h1>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Time-boxed appetite windows per project
          </p>
        </div>
        <CreateCycleForm projects={activeProjects} />
      </div>

      {allCycles.length === 0 ? (
        <EmptyState
          title="No cycles yet"
          subtitle="Create your first cycle to start tracking appetite. Cycles give your team a fixed time budget for shipping work."
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([projectId, group]) => (
            <section key={projectId}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: group.projectColor }}
                />
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group.projectName}
                </h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {group.cycles.map((cycle) => (
                  <CycleCard
                    key={cycle.id}
                    id={cycle.id}
                    name={cycle.name}
                    status={cycle.status}
                    appetiteWeeks={cycle.appetiteWeeks}
                    startsAt={cycle.startsAt?.toISOString() ?? null}
                    endsAt={cycle.endsAt?.toISOString() ?? null}
                    projectName={cycle.projectName}
                    projectColor={cycle.projectColor}
                    requestCount={cycle.requestCount}
                    completedCount={cycle.completedCount}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
