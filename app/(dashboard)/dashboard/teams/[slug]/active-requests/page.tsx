import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  assignments,
  teams,
} from "@/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { CompactRequestRow } from "@/components/dashboard/request-card";
import { PhaseFilter } from "@/components/requests/phase-filter";

// "Active" on this page means in-progress work — Predesign or Design.
// Build (dev) and Track phases are intentionally excluded: dev work lives
// on the kanban, and Track is post-ship measurement, not active queue.
const ACTIVE_PHASES = ["predesign", "design"] as const;
type ActivePhase = (typeof ACTIVE_PHASES)[number];

export default async function ActiveRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const { slug } = await params;
  const { phase: phaseParam } = await searchParams;

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Profile (provides org scope)
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  // Resolve team by slug, scoped to user's org
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.slug, slug), eq(teams.orgId, profile.orgId)));
  if (!team) notFound();

  // Respect the URL phase filter only if it's a valid active phase.
  // If a user clicks "Build" or "Track" on the shared PhaseFilter component,
  // the param is ignored here (the base query still returns active-phase work)
  // and the filter UI shows "All" highlighted — minor UX wart worth shipping.
  const filteredPhase: ActivePhase | null =
    phaseParam && (ACTIVE_PHASES as readonly string[]).includes(phaseParam)
      ? (phaseParam as ActivePhase)
      : null;

  const phasesToQuery: ActivePhase[] = filteredPhase
    ? [filteredPhase]
    : [...ACTIVE_PHASES];

  // Team-scoped active requests
  const activeRequests = await db
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.orgId, profile.orgId),
        eq(requests.projectId, team.id),
        inArray(requests.phase, phasesToQuery),
      ),
    )
    .orderBy(desc(requests.updatedAt));

  // Resolve first-assignee name per request for the card display.
  // Same pattern as Commitments page (Item 15f).
  const assigneeMap: Record<string, string> = {};
  if (activeRequests.length > 0) {
    const requestIds = activeRequests.map((r) => r.id);
    const allAssignments = await db
      .select({
        requestId: assignments.requestId,
        assigneeId: assignments.assigneeId,
        assignedAt: assignments.assignedAt,
      })
      .from(assignments)
      .where(inArray(assignments.requestId, requestIds))
      .orderBy(assignments.assignedAt);

    const assigneeUserIds = [
      ...new Set(allAssignments.map((a) => a.assigneeId)),
    ];

    if (assigneeUserIds.length > 0) {
      const assigneeProfiles = await db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(inArray(profiles.id, assigneeUserIds));

      const nameMap = Object.fromEntries(
        assigneeProfiles.map((p) => [p.id, p.fullName ?? "Unknown"]),
      );

      // allAssignments is ordered by assignedAt asc — first match per request wins
      for (const a of allAssignments) {
        if (!assigneeMap[a.requestId]) {
          assigneeMap[a.requestId] = nameMap[a.assigneeId] ?? "Unknown";
        }
      }
    }
  }

  const filterLabelSuffix =
    filteredPhase === "predesign"
      ? " in Predesign"
      : filteredPhase === "design"
        ? " in Design"
        : "";

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Active requests</h1>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Requests currently in Predesign or Design for this team.
          </p>
        </div>
        <PhaseFilter activePhase={filteredPhase} />
      </div>

      {activeRequests.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          {filteredPhase ? (
            <p className="text-sm text-muted-foreground">
              No active requests{filterLabelSuffix} for this team.
            </p>
          ) : (
            <>
              <h3 className="font-semibold text-sm text-foreground">
                This team&apos;s queue is clear.
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Nothing is in Predesign or Design right now. New requests will
                show up here once they enter the pipeline.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {activeRequests.map((request) => (
            <CompactRequestRow
              key={request.id}
              request={request}
              firstAssigneeName={assigneeMap[request.id] ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
