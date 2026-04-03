import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  assignments,
  figmaUpdates,
  requestStages,
} from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import {
  buildDesignerRows,
  getPhaseHeatMap,
  getRiskItems,
  getShippedThisWeek,
  makeCanAction,
} from "@/lib/radar";
import { RealtimeRadar } from "@/components/realtime/realtime-radar";
import { DesignerStatus } from "@/components/radar/designer-status";
import { HeatMap } from "@/components/radar/heat-map";
import { RiskPanel } from "@/components/radar/risk-panel";
import { ShippedWeek } from "@/components/radar/shipped-week";
import { HeaderSearch } from "@/components/ui/header-search";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { UserMenu } from "@/components/settings/user-menu";

export default async function RadarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [viewer] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!viewer) redirect("/login");

  // Batch 1: org-wide requests and profiles
  const [allRequests, allProfiles] = await Promise.all([
    db.select().from(requests).where(eq(requests.orgId, viewer.orgId)),
    db.select().from(profiles).where(eq(profiles.orgId, viewer.orgId)),
  ]);

  const orgReqIds = allRequests.map((r) => r.id);

  // Batch 2: assignments, Figma drift, stage history
  const [allAssignments, driftUpdates, allStages] = orgReqIds.length
    ? await Promise.all([
        db
          .select({
            requestId: assignments.requestId,
            assigneeId: assignments.assigneeId,
          })
          .from(assignments)
          .where(and(inArray(assignments.requestId, orgReqIds), eq(assignments.role, "lead"))),
        db
          .select({
            requestId: figmaUpdates.requestId,
            postHandoff: figmaUpdates.postHandoff,
            devReviewed: figmaUpdates.devReviewed,
          })
          .from(figmaUpdates)
          .where(
            and(
              inArray(figmaUpdates.requestId, orgReqIds),
              eq(figmaUpdates.postHandoff, true),
              eq(figmaUpdates.devReviewed, false)
            )
          ),
        db
          .select({
            requestId: requestStages.requestId,
            stage: requestStages.stage,
            enteredAt: requestStages.enteredAt,
          })
          .from(requestStages)
          .where(inArray(requestStages.requestId, orgReqIds)),
      ])
    : [[], [], []] as [
        Array<{ requestId: string; assigneeId: string }>,
        Array<{ requestId: string; postHandoff: boolean; devReviewed: boolean }>,
        Array<{ requestId: string; stage: string; enteredAt: Date }>
      ];

  // Build lookup: requestId → primary designer name
  const profileMap = Object.fromEntries(allProfiles.map((p) => [p.id, p.fullName]));
  const designerByRequest: Record<string, string> = {};
  for (const a of allAssignments) {
    designerByRequest[a.requestId] = profileMap[a.assigneeId] ?? "Unassigned";
  }

  // Compute all radar data server-side
  const radarDesigners = buildDesignerRows(allProfiles, allRequests, allAssignments);
  const heatMap = getPhaseHeatMap(allRequests);
  const risk = getRiskItems(allRequests, driftUpdates, designerByRequest);
  const shipped = getShippedThisWeek(allRequests, allStages, designerByRequest);

  // Precompute canAction per designer
  const canAction = makeCanAction(viewer, allProfiles);
  const canActionMap = Object.fromEntries(
    allProfiles.map((p) => [p.id, canAction(p.id)])
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <RealtimeRadar orgId={viewer.orgId} />
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">DesignQ</span>
          <span className="text-zinc-700">·</span>
          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Requests
            </Link>
            <Link
              href="/dashboard/team"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Team
            </Link>
            <Link
              href="/dashboard/insights"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Insights
            </Link>
            <Link
              href="/dashboard/ideas"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Ideas
            </Link>
            <Link
              href="/dashboard/radar"
              className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <HeaderSearch />
          <NotificationsBell />
          <UserMenu fullName={viewer.fullName} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Designer Status
          </h2>
          <DesignerStatus designers={radarDesigners} canActionMap={canActionMap} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Phase Heat Map
          </h2>
          <HeatMap heatMap={heatMap} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Risk
          </h2>
          <RiskPanel risk={risk} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Shipped This Week
          </h2>
          <ShippedWeek shipped={shipped} />
        </section>
      </main>
    </div>
  );
}
