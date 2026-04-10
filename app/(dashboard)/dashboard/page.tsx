import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments, projects, morningBriefings, proactiveAlerts } from "@/db/schema";
import { eq, inArray, sql, and, isNull, gte } from "drizzle-orm";
import { RequestList } from "@/components/requests/request-list";
import { RealtimeDashboard } from "@/components/realtime/realtime-dashboard";
import { MorningBriefingCard } from "@/components/dashboard/morning-briefing-card";
import { AlertsSection } from "@/components/dashboard/alerts-section";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/signup");

  const todayString = new Date().toISOString().slice(0, 10);
  const [briefRow] = await db
    .select()
    .from(morningBriefings)
    .where(
      and(
        eq(morningBriefings.userId, user.id),
        eq(morningBriefings.date, todayString)
      )
    )
    .limit(1);

  const briefForCard = briefRow && !briefRow.dismissedAt ? briefRow : null;

  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const inlineAlerts = (await db
    .select({
      id: proactiveAlerts.id,
      type: proactiveAlerts.type,
      urgency: proactiveAlerts.urgency,
      title: proactiveAlerts.title,
      body: proactiveAlerts.body,
      ctaLabel: proactiveAlerts.ctaLabel,
      ctaUrl: proactiveAlerts.ctaUrl,
    })
    .from(proactiveAlerts)
    .where(
      and(
        eq(proactiveAlerts.recipientId, user.id),
        eq(proactiveAlerts.dismissed, false),
        gte(proactiveAlerts.expiresAt, new Date())
      )
    )).sort((a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9));

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));

  const projectFilter = searchParams?.project;
  const requestsWhere = projectFilter
    ? and(eq(requests.orgId, profile.orgId), eq(requests.projectId, projectFilter))
    : eq(requests.orgId, profile.orgId);

  const allRequests = await db
    .select()
    .from(requests)
    .where(requestsWhere)
    .orderBy(
      sql`CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END`,
      requests.createdAt
    );

  const myAssignments = await db
    .select({ requestId: assignments.requestId })
    .from(assignments)
    .where(eq(assignments.assigneeId, user.id));

  const myRequestIds = new Set(myAssignments.map((a) => a.requestId));

  const orgReqIds = allRequests.map((r) => r.id);
  const allAssignments = orgReqIds.length
    ? await db
        .select({ requestId: assignments.requestId, assigneeId: assignments.assigneeId })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
    : [];

  const orgMembers = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  const memberMap = Object.fromEntries(orgMembers.map((m) => [m.id, m.fullName]));

  const assigneesByRequest: Record<string, string[]> = {};
  for (const a of allAssignments) {
    if (!assigneesByRequest[a.requestId]) assigneesByRequest[a.requestId] = [];
    const name = memberMap[a.assigneeId];
    if (name) assigneesByRequest[a.requestId].push(name);
  }

  const projectMap = Object.fromEntries(
    activeProjects.map((p) => [p.id, { name: p.name, color: p.color }])
  );

  return (
    <>
      <RealtimeDashboard orgId={profile.orgId} />
      <RequestList
        requests={allRequests}
        myRequestIds={myRequestIds}
        assigneesByRequest={assigneesByRequest}
        projects={activeProjects}
        projectMap={projectMap}
        headerContent={
          <>
            <h1 style={{
              fontSize: 18,
              fontWeight: 620,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              marginBottom: 8,
            }}>
              Welcome back, {profile.fullName?.split(" ")[0] ?? "there"}
            </h1>
            <MorningBriefingCard brief={briefForCard} alertCount={inlineAlerts.length} />
            <AlertsSection alerts={inlineAlerts} />
          </>
        }
      />
    </>
  );
}
