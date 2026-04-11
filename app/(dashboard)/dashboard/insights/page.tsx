// app/(dashboard)/dashboard/insights/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  requestAiAnalysis,
  assignments,
  weeklyDigests,
  cycles,
  cycleRequests,
  projects,
} from "@/db/schema";
import { eq, inArray, count, and, sql } from "drizzle-orm";
import { InsightsShell } from "@/components/insights/insights-shell";
import { PipelineChart } from "@/components/analytics/pipeline-chart";
import { FlowRateChart } from "@/components/analytics/flow-rate-chart";
import { CycleThroughputChart } from "@/components/analytics/cycle-throughput-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { DigestResponse } from "@/lib/digest";

const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getISOWeek(date: Date): string {
  const year = date.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - oneJan.getTime()) / 86400000);
  const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
  return `W${String(week).padStart(2, "0")}`;
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  // Fetch stored digest (if fresh enough)
  const [storedDigestRow] = await db
    .select()
    .from(weeklyDigests)
    .where(eq(weeklyDigests.orgId, profile.orgId));

  const isStoredFresh =
    storedDigestRow &&
    Date.now() - new Date(storedDigestRow.generatedAt).getTime() < SEVEN_DAYS_MS;

  const storedDigestData = isStoredFresh
    ? (storedDigestRow.content as DigestResponse)
    : null;

  // Pipeline data
  const members = await db.select().from(profiles).where(eq(profiles.orgId, profile.orgId));
  const orgRequests = await db.select().from(requests).where(eq(requests.orgId, profile.orgId));
  const orgReqIds = orgRequests.map((r) => r.id);

  const triageRows = orgReqIds.length
    ? await db
        .select({
          requestId: requestAiAnalysis.requestId,
          qualityScore: requestAiAnalysis.qualityScore,
        })
        .from(requestAiAnalysis)
        .where(inArray(requestAiAnalysis.requestId, orgReqIds))
    : [];

  const workloadRows = orgReqIds.length
    ? await db
        .select({ assigneeId: assignments.assigneeId, cnt: count() })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
        .groupBy(assignments.assigneeId)
    : [];

  const workloadMap = Object.fromEntries(workloadRows.map((w) => [w.assigneeId, Number(w.cnt)]));

  const now = Date.now();
  const stalledCount = orgRequests.filter((r) => {
    if (STALL_EXEMPT.has(r.status)) return false;
    return (now - new Date(r.updatedAt).getTime()) / 86_400_000 >= 5;
  }).length;

  const statusCounts: Record<string, number> = {};
  for (const r of orgRequests) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  const avgQuality = triageRows.length
    ? Math.round(triageRows.reduce((s, t) => s + t.qualityScore, 0) / triageRows.length)
    : null;

  const qualityByPM: Record<string, { total: number; count: number }> = {};
  for (const t of triageRows) {
    const req = orgRequests.find((r) => r.id === t.requestId);
    if (!req) continue;
    if (!qualityByPM[req.requesterId]) qualityByPM[req.requesterId] = { total: 0, count: 0 };
    qualityByPM[req.requesterId].total += t.qualityScore;
    qualityByPM[req.requesterId].count += 1;
  }

  const shippedCount = orgRequests.filter(
    (r) => r.status === "shipped" || r.status === "completed"
  ).length;
  const activeCount = orgRequests.filter(
    (r) => !STALL_EXEMPT.has(r.status) && r.status !== "submitted"
  ).length;

  // Pipeline data by phase
  const phaseCounts: Record<string, number> = {};
  for (const r of orgRequests) {
    const phase = r.phase ?? "predesign";
    phaseCounts[phase] = (phaseCounts[phase] ?? 0) + 1;
  }
  const pipelineData = ["predesign", "design", "dev", "track"]
    .map((phase) => ({ phase, count: phaseCounts[phase] ?? 0 }))
    .filter((d) => d.count > 0);

  // Flow rate data: requests entering and completing design phase per week
  const flowRateMap: Record<string, { entered: number; completed: number }> = {};
  for (const r of orgRequests) {
    const weekKey = new Date(r.createdAt).toISOString().slice(0, 10).replace(/-..$/, "");
    const yearWeek = getISOWeek(new Date(r.createdAt));
    if (!flowRateMap[yearWeek]) flowRateMap[yearWeek] = { entered: 0, completed: 0 };
    if (r.phase === "design" || r.phase === "dev" || r.phase === "track") {
      flowRateMap[yearWeek].entered += 1;
    }
    if (r.phase === "track" || (r.phase === "dev" && r.kanbanState === "done")) {
      flowRateMap[yearWeek].completed += 1;
    }
  }
  const flowRateData = Object.entries(flowRateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12) // last 12 weeks
    .map(([week, d]) => ({ week, entered: d.entered, completed: d.completed }));

  // Cycle throughput data
  const orgCycles = await db
    .select({
      id: cycles.id,
      name: cycles.name,
      status: cycles.status,
    })
    .from(cycles)
    .where(eq(cycles.orgId, profile.orgId));

  const cycleThroughputData: { cycleName: string; completed: number; total: number }[] = [];
  if (orgCycles.length > 0) {
    const cycleIds = orgCycles.map((c) => c.id);
    const crCountRows = await db
      .select({ cycleId: cycleRequests.cycleId, total: count() })
      .from(cycleRequests)
      .where(sql`${cycleRequests.cycleId} IN (${sql.join(cycleIds.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(cycleRequests.cycleId);

    const crCompletedRows = await db
      .select({ cycleId: cycleRequests.cycleId, completed: count() })
      .from(cycleRequests)
      .innerJoin(requests, eq(cycleRequests.requestId, requests.id))
      .where(
        and(
          sql`${cycleRequests.cycleId} IN (${sql.join(cycleIds.map((id) => sql`${id}`), sql`, `)})`,
          sql`(${requests.phase} = 'track' OR (${requests.phase} = 'dev' AND ${requests.kanbanState} = 'done'))`
        )
      )
      .groupBy(cycleRequests.cycleId);

    const totalMap = Object.fromEntries(crCountRows.map((r) => [r.cycleId, Number(r.total)]));
    const completedMap = Object.fromEntries(crCompletedRows.map((r) => [r.cycleId, Number(r.completed)]));

    for (const c of orgCycles) {
      cycleThroughputData.push({
        cycleName: c.name,
        completed: completedMap[c.id] ?? 0,
        total: totalMap[c.id] ?? 0,
      });
    }
  }

  const STATUS_ORDER = [
    "submitted",
    "triaged",
    "assigned",
    "in_progress",
    "in_review",
    "blocked",
    "completed",
    "shipped",
    "draft",
  ];
  const STATUS_COLORS: Record<string, string> = {
    submitted: "bg-blue-500/60",
    triaged: "bg-[var(--phase-design)]/60",
    assigned: "bg-[var(--phase-predesign)]/60",
    in_progress: "bg-[var(--accent-success)]/60",
    in_review: "bg-[var(--phase-dev)]/60",
    blocked: "bg-red-500/60",
    completed: "bg-border/80",
    shipped: "bg-primary/40",
    draft: "bg-accent",
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      {/* Digest + PM calibration (client shell with shared coaching state) */}
      <InsightsShell
        initialDigest={storedDigestData?.digest}
        initialPmCoaching={storedDigestData?.pmCoaching}
      />

      {/* Pipeline metrics */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Pipeline
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total requests" value={orgRequests.length} />
          <MetricCard label="Active" value={activeCount} />
          <MetricCard
            label="Stalled"
            value={stalledCount}
            color={stalledCount > 0 ? "text-amber-600" : undefined}
          />
          <MetricCard label="Shipped" value={shippedCount} color="text-[var(--accent-success)]" />
        </div>
      </section>

      {/* Status breakdown */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Status breakdown
        </h2>
        <Card>
          <CardContent className="space-y-3 pt-5">
            {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => {
              const cnt = statusCounts[s] ?? 0;
              const pct = Math.round((cnt / orgRequests.length) * 100);
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 capitalize shrink-0">
                    {s.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 bg-accent rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_COLORS[s]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0 font-mono">
                    {cnt}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      {/* PM request quality */}
      {Object.keys(qualityByPM).length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            PM request quality
          </h2>
          <div className="space-y-2">
            {members
              .filter((m) => qualityByPM[m.id])
              .sort((a, b) => {
                const qa = qualityByPM[a.id];
                const qb = qualityByPM[b.id];
                return qb.total / qb.count - qa.total / qa.count;
              })
              .map((m) => {
                const q = qualityByPM[m.id];
                const avg = Math.round(q.total / q.count);
                return (
                  <Card key={m.id} size="sm">
                    <CardContent className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{m.fullName}</p>
                        <p className="text-xs text-muted-foreground/60">
                          {q.count} request{q.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-accent rounded-full h-1.5">
                          <div
                            className={`h-full rounded-full ${
                              avg >= 80
                                ? "bg-[var(--accent-success)]/70"
                                : avg >= 50
                                ? "bg-[var(--accent-active)]/70"
                                : "bg-red-500/70"
                            }`}
                            style={{ width: `${avg}%` }}
                          />
                        </div>
                        <span
                          className={`text-xs font-mono w-14 text-right ${
                            avg >= 80
                              ? "text-[var(--accent-success)]"
                              : avg >= 50
                              ? "text-[var(--accent-active)]"
                              : "text-red-600"
                          }`}
                        >
                          {avg}/100
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            {avgQuality !== null && (
              <p className="text-xs text-muted-foreground/60 pt-1">
                Org avg quality score: {avgQuality}/100
              </p>
            )}
          </div>
        </section>
      )}

      {/* Designer workload */}
      {workloadRows.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Designer workload
          </h2>
          <div className="space-y-2">
            {members
              .filter(
                (m) =>
                  (m.role === "designer" || m.role === "lead") &&
                  workloadMap[m.id] !== undefined
              )
              .sort((a, b) => (workloadMap[b.id] ?? 0) - (workloadMap[a.id] ?? 0))
              .map((m) => {
                const load = workloadMap[m.id] ?? 0;
                const maxLoad = Math.max(...Object.values(workloadMap), 1);
                const isOverloaded = load >= 4;
                return (
                  <Card key={m.id} size="sm">
                    <CardContent className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{m.fullName}</p>
                        <p className="text-xs text-muted-foreground/60 capitalize">{m.role}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-accent rounded-full h-1.5">
                          <div
                            className={`h-full rounded-full ${
                              isOverloaded ? "bg-red-500/70" : "bg-[var(--accent-active)]/60"
                            }`}
                            style={{ width: `${Math.min((load / maxLoad) * 100, 100)}%` }}
                          />
                        </div>
                        <span
                          className={`text-xs font-mono w-20 text-right ${
                            isOverloaded ? "text-red-600" : "text-muted-foreground"
                          }`}
                        >
                          {load} active
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      )}

      {/* Pipeline view */}
      {pipelineData.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Pipeline view
          </h2>
          <Card>
            <CardContent className="pt-5">
              <PipelineChart data={pipelineData} />
            </CardContent>
          </Card>
        </section>
      )}

      {/* Flow rate */}
      {flowRateData.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Flow rate
          </h2>
          <Card>
            <CardContent className="pt-5">
              <FlowRateChart data={flowRateData} />
            </CardContent>
          </Card>
        </section>
      )}

      {/* Cycle throughput */}
      {cycleThroughputData.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Cycle throughput
          </h2>
          <Card>
            <CardContent className="pt-5">
              <CycleThroughputChart data={cycleThroughputData} />
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="px-5 py-4">
        <p className="text-xs text-muted-foreground/60 mb-1">{label}</p>
        <p className={`text-2xl font-semibold ${color ?? "text-foreground"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
