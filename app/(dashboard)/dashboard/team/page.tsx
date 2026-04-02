import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, invites, requests, requestAiAnalysis, assignments } from "@/db/schema";
import { eq, avg, count, inArray } from "drizzle-orm";
import { InviteForm } from "@/components/team/invite-form";
import { ReportsToSelect } from "@/components/team/reports-to-select";
import { UserMenu } from "@/components/settings/user-menu";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { HeaderSearch } from "@/components/ui/header-search";

const roleLabels: Record<string, string> = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
  lead: "Lead",
  admin: "Admin",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isExpired(date: Date | string) {
  return new Date() > new Date(date);
}

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const members = await db.select().from(profiles).where(eq(profiles.orgId, profile.orgId));

  // PM quality scores: avg quality score + request count per requester
  const orgRequests = await db
    .select({ id: requests.id, requesterId: requests.requesterId })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));

  const orgReqIds = orgRequests.map((r) => r.id);

  const qualityRows = orgReqIds.length
    ? await db
        .select({ requestId: requestAiAnalysis.requestId, score: requestAiAnalysis.qualityScore })
        .from(requestAiAnalysis)
        .where(inArray(requestAiAnalysis.requestId, orgReqIds))
    : [];

  // Build quality stats per requester
  const qualityByRequester: Record<string, { total: number; count: number }> = {};
  for (const row of qualityRows) {
    const req = orgRequests.find((r) => r.id === row.requestId);
    if (!req) continue;
    if (!qualityByRequester[req.requesterId]) qualityByRequester[req.requesterId] = { total: 0, count: 0 };
    qualityByRequester[req.requesterId].total += row.score;
    qualityByRequester[req.requesterId].count += 1;
  }

  const pmStats: Record<string, { avgQuality: number; requestCount: number }> = {};
  for (const [id, s] of Object.entries(qualityByRequester)) {
    pmStats[id] = { avgQuality: Math.round(s.total / s.count), requestCount: s.count };
  }

  // Active assignment counts per designer
  const workloadRows = orgReqIds.length
    ? await db
        .select({ assigneeId: assignments.assigneeId, count: count() })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
        .groupBy(assignments.assigneeId)
    : [];
  const designerLoad: Record<string, number> = Object.fromEntries(
    workloadRows.map((w) => [w.assigneeId, Number(w.count)])
  );

  const pendingInvites = await db
    .select()
    .from(invites)
    .where(eq(invites.orgId, profile.orgId));

  const activePending = pendingInvites.filter((i) => !i.acceptedAt && !isExpired(i.expiresAt));
  const expired = pendingInvites.filter((i) => !i.acceptedAt && isExpired(i.expiresAt));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
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
              className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
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
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <HeaderSearch />
          <NotificationsBell />
          <UserMenu fullName={profile.fullName} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Invite section */}
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">Invite member</h2>
          <InviteForm />
          <p className="text-xs text-zinc-700 mt-2">
            Invite links are valid for 7 days. Share directly with your teammate — no email required.
          </p>
        </section>

        {/* Current members */}
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Team ({members.length})
          </h2>
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border border-zinc-800 rounded-xl px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400">
                    {m.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white">
                      {m.fullName}
                      {m.id === user.id && (
                        <span className="text-xs text-zinc-600 ml-1.5">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-600">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* PM quality score */}
                  {pmStats[m.id] && (
                    <div className="text-right">
                      <p className={`text-xs font-mono ${
                        pmStats[m.id].avgQuality >= 80 ? "text-green-400" :
                        pmStats[m.id].avgQuality >= 50 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {pmStats[m.id].avgQuality}/100
                      </p>
                      <p className="text-[10px] text-zinc-600">{pmStats[m.id].requestCount} requests</p>
                    </div>
                  )}
                  {/* Designer workload */}
                  {(m.role === "designer" || m.role === "lead") && designerLoad[m.id] !== undefined && (
                    <div className="text-right">
                      <p className="text-xs text-zinc-400">{designerLoad[m.id]}</p>
                      <p className="text-[10px] text-zinc-600">assigned</p>
                    </div>
                  )}
                  {profile.role === "admin" && (
                    <ReportsToSelect
                      memberId={m.id}
                      currentManagerId={m.managerId ?? null}
                      managers={members.filter(
                        (p) =>
                          (p.role === "lead" || p.role === "admin") &&
                          p.id !== m.id
                      )}
                    />
                  )}
                  <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 capitalize">
                    {roleLabels[m.role] ?? m.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pending invites */}
        {activePending.length > 0 && (
          <section>
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
              Pending invites ({activePending.length})
            </h2>
            <div className="space-y-2">
              {activePending.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between border border-zinc-800 rounded-xl px-5 py-3"
                >
                  <div>
                    <p className="text-sm text-zinc-300">{inv.email}</p>
                    <p className="text-xs text-zinc-600 capitalize">
                      {roleLabels[inv.role] ?? inv.role} · Expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <span className="text-xs text-yellow-500/70">Pending</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {expired.length > 0 && (
          <section>
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
              Expired invites ({expired.length})
            </h2>
            <div className="space-y-2">
              {expired.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between border border-zinc-800/50 rounded-xl px-5 py-3 opacity-50"
                >
                  <div>
                    <p className="text-sm text-zinc-400">{inv.email}</p>
                    <p className="text-xs text-zinc-600 capitalize">
                      {roleLabels[inv.role] ?? inv.role} · Expired {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-600">Expired</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
