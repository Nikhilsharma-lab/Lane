import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  assignments,
  morningBriefings,
  proactiveAlerts,
  validationSignoffs,
} from "@/db/schema";
import { eq, inArray, sql, and, gte } from "drizzle-orm";
import { RealtimeDashboard } from "@/components/realtime/realtime-dashboard";
import { MorningBriefingCard } from "@/components/dashboard/morning-briefing-card";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import {
  RichRequestCard,
  MediumRequestCard,
  CompactRequestRow,
} from "@/components/dashboard/request-card";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { buildFocusSections } from "@/lib/focus-ordering";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import type { Request } from "@/db/schema";

// ── Greeting helper ────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ── Focus section ───────────────────────────────────────────────────────────

function FocusSectionBlock({
  sectionKey,
  label,
  color,
  sectionRequests,
  assigneesByRequest,
}: {
  sectionKey: string;
  label: string;
  color: string;
  sectionRequests: Request[];
  assigneesByRequest: Record<string, string[]>;
}) {
  const isCompleted = sectionKey === "completed";

  return (
    <section aria-label={label} className={isCompleted ? "opacity-60" : ""}>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
        <SectionLabel className="mb-0">{label}</SectionLabel>
        <Badge
          variant="outline"
          size="sm"
          className="font-mono text-muted-foreground/50"
        >
          {sectionRequests.length}
        </Badge>
      </div>

      {/* Tier: Rich cards for attention */}
      {sectionKey === "attention" && (
        <div className="space-y-3">
          {sectionRequests.map((r) => (
            <RichRequestCard
              key={r.id}
              request={r}
              firstAssigneeName={assigneesByRequest[r.id]?.[0]}
            />
          ))}
        </div>
      )}

      {/* Tier: Medium cards in grid for active work */}
      {sectionKey === "active" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sectionRequests.map((r) => (
            <MediumRequestCard
              key={r.id}
              request={r}
              firstAssigneeName={assigneesByRequest[r.id]?.[0]}
            />
          ))}
        </div>
      )}

      {/* Tier: Compact rows for recent / completed */}
      {(sectionKey === "recent" || sectionKey === "completed") && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {sectionRequests.map((r) => (
            <CompactRequestRow
              key={r.id}
              request={r}
              firstAssigneeName={assigneesByRequest[r.id]?.[0]}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
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

  const firstName = profile.fullName?.split(" ")[0] ?? "there";
  const todayString = new Date().toISOString().slice(0, 10);

  // Batch 1: All independent queries in parallel
  const [
    [briefRow],
    alertsRaw,
    allRequests,
    myAssignments,
    orgMembers,
  ] = await Promise.all([
    db
      .select()
      .from(morningBriefings)
      .where(
        and(
          eq(morningBriefings.userId, user.id),
          eq(morningBriefings.date, todayString)
        )
      )
      .limit(1),
    db
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
      ),
    db
      .select()
      .from(requests)
      .where(eq(requests.orgId, profile.orgId))
      .orderBy(
        sql`CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END`,
        requests.createdAt
      ),
    db
      .select({ requestId: assignments.requestId })
      .from(assignments)
      .where(eq(assignments.assigneeId, user.id)),
    db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.orgId, profile.orgId)),
  ]);

  const briefForCard = briefRow && !briefRow.dismissedAt ? briefRow : null;
  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const inlineAlerts = alertsRaw.sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9)
  );

  const myRequestIds = new Set(myAssignments.map((a) => a.requestId));

  // Batch 2: Queries that depend on allRequests
  const proveRequests = allRequests.filter(
    (r) => r.phase === "design" && r.designStage === "refine"
  );
  const orgReqIds = allRequests.map((r) => r.id);

  const [validationRows, allAssignments] = await Promise.all([
    proveRequests.length > 0
      ? db
          .select({ requestId: validationSignoffs.requestId })
          .from(validationSignoffs)
          .where(
            and(
              eq(validationSignoffs.signerId, user.id),
              inArray(validationSignoffs.requestId, proveRequests.map((r) => r.id))
            )
          )
      : Promise.resolve([]),
    orgReqIds.length
      ? db
          .select({
            requestId: assignments.requestId,
            assigneeId: assignments.assigneeId,
          })
          .from(assignments)
          .where(inArray(assignments.requestId, orgReqIds))
      : Promise.resolve([]),
  ]);

  const signedIds = new Set(validationRows.map((v) => v.requestId));
  const validationsPending = new Set(
    proveRequests.map((r) => r.id).filter((id) => !signedIds.has(id))
  );

  // Build focus sections
  const focusSections = buildFocusSections({
    allRequests,
    userId: user.id,
    myRequestIds,
    validationsPending,
  });
  const memberMap = Object.fromEntries(orgMembers.map((m) => [m.id, m.fullName]));

  const assigneesByRequest: Record<string, string[]> = {};
  for (const a of allAssignments) {
    if (!assigneesByRequest[a.requestId]) assigneesByRequest[a.requestId] = [];
    const name = memberMap[a.assigneeId];
    if (name) assigneesByRequest[a.requestId].push(name);
  }

  const isEmpty = focusSections.length === 0;

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── Right panel data (derived, no extra queries) ──────────────────────
  const phaseCounts: Record<string, number> = { predesign: 0, design: 0, dev: 0, track: 0 };
  const priorityCounts: Record<string, number> = { p0: 0, p1: 0, p2: 0, p3: 0 };
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  let shippedThisWeek = 0;

  for (const r of allRequests) {
    if (r.phase) phaseCounts[r.phase] = (phaseCounts[r.phase] ?? 0) + 1;
    if (r.priority) priorityCounts[r.priority] = (priorityCounts[r.priority] ?? 0) + 1;
    if (r.status === "shipped" && r.updatedAt > oneWeekAgo) shippedThisWeek++;
  }

  const phases = [
    { key: "predesign", label: "Predesign", count: phaseCounts.predesign },
    { key: "design", label: "Design", count: phaseCounts.design },
    { key: "dev", label: "Dev", count: phaseCounts.dev },
    { key: "track", label: "Track", count: phaseCounts.track },
  ];

  const priorityLabels: Record<string, string> = { p0: "Urgent", p1: "High", p2: "Medium", p3: "Low" };
  const priorityStats = ["p0", "p1", "p2", "p3"].map((k) => ({
    key: k,
    label: priorityLabels[k],
    count: priorityCounts[k],
  }));

  // Count active assignments per member
  const teamCounts: Record<string, number> = {};
  for (const a of allAssignments) {
    const name = memberMap[a.assigneeId];
    if (name) teamCounts[name] = (teamCounts[name] ?? 0) + 1;
  }
  const teamStats = Object.entries(teamCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      initials: name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2),
    }));

  return (
    <>
      <RealtimeDashboard orgId={profile.orgId} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-12 px-5 shrink-0">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {getGreeting()}, {firstName}
        </span>
        <span className="text-xs text-muted-foreground/60 font-mono">
          {todayFormatted}
        </span>
      </div>

      {/* ── 3-pane body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden gap-4 px-4 pb-4">
        {/* ── Main content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="py-2 space-y-6">
            {/* Morning briefing */}
            <MorningBriefingCard
              brief={briefForCard}
              alertCount={inlineAlerts.length}
            />

            {/* Alerts */}
            <AlertsSection alerts={inlineAlerts} />

            {/* Focus sections */}
            {isEmpty ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-center max-w-xs leading-relaxed text-muted-foreground/60">
                  You&apos;re clear. Time to think, learn, or help a teammate.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {focusSections.map((section) => (
                  <FocusSectionBlock
                    key={section.key}
                    sectionKey={section.key}
                    label={section.label}
                    color={section.color}
                    sectionRequests={section.requests}
                    assigneesByRequest={assigneesByRequest}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right summary panel ─────────────────────────────────────── */}
        <aside className="hidden lg:flex w-[260px] shrink-0 flex-col rounded-xl border bg-card">
          <DashboardSummary
            phases={phases}
            priorities={priorityStats}
            team={teamStats}
            totalRequests={allRequests.length}
            shippedThisWeek={shippedThisWeek}
          />
        </aside>
      </div>
    </>
  );
}
