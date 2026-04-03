import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, requestAiAnalysis, assignments, projects } from "@/db/schema";
import { eq, inArray, count, and, isNull } from "drizzle-orm";
import { DigestPanel } from "@/components/insights/digest-panel";
import { PmCalibration } from "@/components/insights/pm-calibration";

const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));
  // Shell provides nav — activeProjects not needed in JSX
  void activeProjects;

  const members = await db.select().from(profiles).where(eq(profiles.orgId, profile.orgId));
  const orgRequests = await db.select().from(requests).where(eq(requests.orgId, profile.orgId));
  const orgReqIds = orgRequests.map((r) => r.id);

  const triageRows = orgReqIds.length
    ? await db
        .select({ requestId: requestAiAnalysis.requestId, qualityScore: requestAiAnalysis.qualityScore })
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

  const shippedCount = orgRequests.filter((r) => r.status === "shipped" || r.status === "completed").length;
  const activeCount = orgRequests.filter((r) => !STALL_EXEMPT.has(r.status) && r.status !== "submitted").length;

  const STATUS_ORDER = ["submitted", "triaged", "assigned", "in_progress", "in_review", "blocked", "completed", "shipped", "draft"];
  const STATUS_COLORS: Record<string, string> = {
    submitted: "bg-blue-500/60",
    triaged: "bg-purple-500/60",
    assigned: "bg-yellow-500/60",
    in_progress: "bg-green-500/60",
    in_review: "bg-cyan-500/60",
    blocked: "bg-red-500/60",
    completed: "bg-[var(--border-strong)]",
    shipped: "bg-[var(--accent)]/40",
    draft: "bg-[var(--bg-hover)]",
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      {/* AI Digest */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">Weekly digest</h2>
        <DigestPanel />
      </section>

      {/* Key metrics */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">Pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Total requests" value={orgRequests.length} />
          <Metric label="Active" value={activeCount} />
          <Metric
            label="Stalled"
            value={stalledCount}
            color={stalledCount > 0 ? "text-yellow-400" : undefined}
          />
          <Metric label="Shipped" value={shippedCount} color="text-green-400" />
        </div>
      </section>

      {/* Status breakdown */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">Status breakdown</h2>
        <div className="border border-[var(--border)] rounded-xl p-5 space-y-3">
          {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => {
            const cnt = statusCounts[s] ?? 0;
            const pct = Math.round((cnt / orgRequests.length) * 100);
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-secondary)] w-20 capitalize shrink-0">{s.replace(/_/g, " ")}</span>
                <div className="flex-1 bg-[var(--bg-hover)] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${STATUS_COLORS[s]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--text-secondary)] w-6 text-right shrink-0">{cnt}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* PM quality */}
      {Object.keys(qualityByPM).length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">PM request quality</h2>
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
                  <div key={m.id} className="flex items-center gap-3 border border-[var(--border)] rounded-xl px-5 py-3">
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{m.fullName}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{q.count} request{q.count !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-[var(--bg-hover)] rounded-full h-1.5">
                        <div
                          className={`h-full rounded-full ${avg >= 80 ? "bg-green-500/70" : avg >= 50 ? "bg-yellow-500/70" : "bg-red-500/70"}`}
                          style={{ width: `${avg}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono w-14 text-right ${avg >= 80 ? "text-green-400" : avg >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                        {avg}/100
                      </span>
                    </div>
                  </div>
                );
              })}
            {avgQuality !== null && (
              <p className="text-xs text-[var(--text-tertiary)] pt-1">Org avg quality score: {avgQuality}/100</p>
            )}
          </div>
        </section>
      )}

      {/* PM Calibration */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">PM calibration</h2>
        <PmCalibration />
      </section>

      {/* Designer workload */}
      {workloadRows.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">Designer workload</h2>
          <div className="space-y-2">
            {members
              .filter((m) => (m.role === "designer" || m.role === "lead") && workloadMap[m.id] !== undefined)
              .sort((a, b) => (workloadMap[b.id] ?? 0) - (workloadMap[a.id] ?? 0))
              .map((m) => {
                const load = workloadMap[m.id] ?? 0;
                const maxLoad = Math.max(...Object.values(workloadMap), 1);
                const isOverloaded = load >= 4;
                return (
                  <div key={m.id} className="flex items-center gap-3 border border-[var(--border)] rounded-xl px-5 py-3">
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{m.fullName}</p>
                      <p className="text-xs text-[var(--text-tertiary)] capitalize">{m.role}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-[var(--bg-hover)] rounded-full h-1.5">
                        <div
                          className={`h-full rounded-full ${isOverloaded ? "bg-red-500/70" : "bg-[#D4A84B]/60"}`}
                          style={{ width: `${Math.min((load / maxLoad) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono w-20 text-right ${isOverloaded ? "text-red-400" : "text-[var(--text-secondary)]"}`}>
                        {load} active{isOverloaded ? " ⚠" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="border border-[var(--border)] rounded-xl px-5 py-4">
      <p className="text-xs text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color ?? "text-[var(--text-primary)]"}`}>{value}</p>
    </div>
  );
}
