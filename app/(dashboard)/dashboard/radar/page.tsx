import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  assignments,
  figmaUpdates,
  requestStages,
  comments,
} from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import {
  buildDesignerRows,
  getPhaseHeatMap,
  getRiskItems,
  getShippedThisWeek,
  makeCanAction,
  computeAvgDevQuestions,
} from "@/lib/radar";
import { RealtimeRadar } from "@/components/realtime/realtime-radar";
import { DesignerStatus } from "@/components/radar/designer-status";
import { HeatMap } from "@/components/radar/heat-map";
import { RiskPanel } from "@/components/radar/risk-panel";
import { ShippedWeek } from "@/components/radar/shipped-week";

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

  // Batch 2: assignments, Figma drift, stage history, dev questions
  const [allAssignments, driftUpdates, allStages, devQuestions] = orgReqIds.length
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
        db
          .select({ requestId: comments.requestId })
          .from(comments)
          .where(
            and(
              inArray(comments.requestId, orgReqIds),
              eq(comments.isDevQuestion, true)
            )
          ),
      ])
    : [[], [], [], []] as [
        Array<{ requestId: string; assigneeId: string }>,
        Array<{ requestId: string; postHandoff: boolean; devReviewed: boolean }>,
        Array<{ requestId: string; stage: string; enteredAt: Date }>,
        Array<{ requestId: string }>
      ];

  // Build lookup: requestId → primary designer name
  const profileMap = Object.fromEntries(allProfiles.map((p) => [p.id, p.fullName]));
  const designerByRequest: Record<string, string> = {};
  for (const a of allAssignments) {
    designerByRequest[a.requestId] = profileMap[a.assigneeId] ?? "Unassigned";
  }

  // Compute all radar data server-side
  const radarDesigners = buildDesignerRows(allProfiles, allRequests, allAssignments);
  const avgDevQuestionsMap = computeAvgDevQuestions(
    radarDesigners,
    allRequests,
    allAssignments,
    devQuestions,
  );
  const heatMap = getPhaseHeatMap(allRequests);
  const risk = getRiskItems(allRequests, driftUpdates, designerByRequest);
  const shipped = getShippedThisWeek(allRequests, allStages, designerByRequest);

  // Precompute canAction per designer
  const canAction = makeCanAction(viewer, allProfiles);
  const canActionMap = Object.fromEntries(
    allProfiles.map((p) => [p.id, canAction(p.id)])
  );

  return (
    <>
      <RealtimeRadar orgId={viewer.orgId} />
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Designer Status
          </h2>
          <DesignerStatus designers={radarDesigners} canActionMap={canActionMap} avgDevQuestionsMap={avgDevQuestionsMap} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Phase Heat Map
          </h2>
          <HeatMap heatMap={heatMap} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Risk
          </h2>
          <RiskPanel risk={risk} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Shipped This Week
          </h2>
          <ShippedWeek shipped={shipped} />
        </section>
      </main>
    </>
  );
}
