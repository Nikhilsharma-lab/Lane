import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, invites, requests, requestAiAnalysis, assignments, projects } from "@/db/schema";
import { eq, count, inArray, and, isNull } from "drizzle-orm";
import { InviteForm } from "@/components/team/invite-form";
import { ReportsToSelect } from "@/components/team/reports-to-select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

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

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));
  void activeProjects;

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
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      {/* Invite section */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Invite member</h2>
        <InviteForm />
        <p className="text-xs text-muted-foreground/60 mt-2">
          Invite links are valid for 7 days. Share directly with your teammate -- no email required.
        </p>
      </section>

      {/* Current members */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Team ({members.length})
        </h2>
        <div className="space-y-2">
          {members.map((m) => (
            <Card key={m.id} size="sm">
              <CardContent className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs font-medium">
                      {m.fullName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm text-foreground">
                      {m.fullName}
                      {m.id === user.id && (
                        <span className="text-xs text-muted-foreground/60 ml-1.5">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground/60">{m.email}</p>
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
                      <p className="text-[10px] text-muted-foreground/60">{pmStats[m.id].requestCount} requests</p>
                    </div>
                  )}
                  {/* Designer workload */}
                  {(m.role === "designer" || m.role === "lead") && designerLoad[m.id] !== undefined && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{designerLoad[m.id]}</p>
                      <p className="text-[10px] text-muted-foreground/60">assigned</p>
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
                  <Badge variant="outline" className="capitalize">
                    {roleLabels[m.role] ?? m.role}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pending invites */}
      {activePending.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Pending invites ({activePending.length})
          </h2>
          <div className="space-y-2">
            {activePending.map((inv) => (
              <Card key={inv.id} size="sm">
                <CardContent className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-foreground">{inv.email}</p>
                    <p className="text-xs text-muted-foreground/60 capitalize">
                      {roleLabels[inv.role] ?? inv.role} · Expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-yellow-500/70">
                    Pending
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {expired.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Expired invites ({expired.length})
          </h2>
          <div className="space-y-2">
            {expired.map((inv) => (
              <Card key={inv.id} size="sm" className="opacity-50">
                <CardContent className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{inv.email}</p>
                    <p className="text-xs text-muted-foreground/60 capitalize">
                      {roleLabels[inv.role] ?? inv.role} · Expired {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-muted-foreground/60">
                    Expired
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
