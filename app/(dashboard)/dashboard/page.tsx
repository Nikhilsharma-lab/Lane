import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  assignments,
  projects,
  morningBriefings,
  proactiveAlerts,
  validationSignoffs,
} from "@/db/schema";
import { eq, inArray, sql, and, isNull, gte, notInArray } from "drizzle-orm";
import { RealtimeDashboard } from "@/components/realtime/realtime-dashboard";
import { MorningBriefingCard } from "@/components/dashboard/morning-briefing-card";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import { buildFocusSections } from "@/lib/focus-ordering";
import { getActiveStageLabel, getPhaseLabel } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import type { Request } from "@/db/schema";

// ── Priority badge helpers ──────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <Badge
      variant="outline"
      className="font-mono text-[10px] font-bold uppercase tracking-wide shrink-0 border-transparent"
      style={{
        background: `var(--priority-${priority}-bg)`,
        color: `var(--priority-${priority}-text)`,
      }}
    >
      {priority.toUpperCase()}
    </Badge>
  );
}

// ── Request card ────────────────────────────────────────────────────────────

function RequestCard({
  request,
  firstAssigneeName,
}: {
  request: Request;
  firstAssigneeName: string | undefined;
}) {
  const phaseLabel = request.phase ? getPhaseLabel(request.phase) : null;
  const stageLabel = getActiveStageLabel(request);

  return (
    <Link
      href={`/dashboard/requests?dock=${request.id}`}
      className="flex items-center gap-3 px-5 py-2.5 no-underline transition-colors border-b hover:bg-muted"
    >
      {/* Title */}
      <span className="flex-1 text-sm font-medium truncate text-foreground">
        {request.title}
      </span>

      {/* Phase · Stage */}
      {phaseLabel && (
        <span className="font-mono text-[10px] whitespace-nowrap shrink-0 text-muted-foreground/60">
          {phaseLabel} · {stageLabel}
        </span>
      )}

      {/* Priority badge */}
      <PriorityBadge priority={request.priority} />

      {/* First assignee */}
      {firstAssigneeName && (
        <span className="font-mono text-[10px] whitespace-nowrap shrink-0 text-muted-foreground/60">
          {firstAssigneeName}
        </span>
      )}
    </Link>
  );
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
  return (
    <section aria-label={label} className="mb-6">
      {/* Section header */}
      <div className="flex items-center gap-2 px-5 py-1.5 border-b">
        <span
          aria-hidden
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{ background: color }}
        />
        <span className="font-mono text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {sectionRequests.length}
        </span>
      </div>

      {/* Request cards */}
      <div>
        {sectionRequests.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            firstAssigneeName={assigneesByRequest[r.id]?.[0]}
          />
        ))}
      </div>
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

  // Morning briefing
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

  // Proactive alerts
  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const inlineAlerts = (
    await db
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
      )
  ).sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9)
  );

  // All org requests ordered by priority
  const allRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .orderBy(
      sql`CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END`,
      requests.createdAt
    );

  // My assignments → myRequestIds
  const myAssignments = await db
    .select({ requestId: assignments.requestId })
    .from(assignments)
    .where(eq(assignments.assigneeId, user.id));
  const myRequestIds = new Set(myAssignments.map((a) => a.requestId));

  // Pending validations — prove-stage requests where user hasn't signed off yet
  const proveRequests = allRequests.filter(
    (r) => r.phase === "design" && r.designStage === "prove"
  );
  let validationsPending = new Set<string>();
  if (proveRequests.length > 0) {
    const proveIds = proveRequests.map((r) => r.id);
    const alreadySigned = await db
      .select({ requestId: validationSignoffs.requestId })
      .from(validationSignoffs)
      .where(
        and(
          eq(validationSignoffs.signerId, user.id),
          inArray(validationSignoffs.requestId, proveIds)
        )
      );
    const signedIds = new Set(alreadySigned.map((v) => v.requestId));
    validationsPending = new Set(proveIds.filter((id) => !signedIds.has(id)));
  }

  // Build focus sections
  const focusSections = buildFocusSections({
    allRequests,
    userId: user.id,
    myRequestIds,
    validationsPending,
  });

  // Assignee names for all org requests
  const orgReqIds = allRequests.map((r) => r.id);
  const allAssignments = orgReqIds.length
    ? await db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
        })
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

  // Active projects (kept for RealtimeDashboard context)
  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));
  void activeProjects; // used implicitly via RealtimeDashboard

  const isEmpty = focusSections.length === 0;

  return (
    <>
      <RealtimeDashboard orgId={profile.orgId} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center h-10 px-5 shrink-0 border-b bg-card">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Home
        </span>
      </div>

      {/* ── Morning briefing ─────────────────────────────────────────────── */}
      <MorningBriefingCard brief={briefForCard} alertCount={inlineAlerts.length} />

      {/* ── Alerts ──────────────────────────────────────────────────────── */}
      <div className="px-5 pt-3">
        <AlertsSection alerts={inlineAlerts} />
      </div>

      {/* ── Focus sections ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex items-center justify-center px-5 py-20">
            <p className="text-sm text-center max-w-xs leading-relaxed text-muted-foreground/60">
              You&apos;re clear. Time to think, learn, or help a teammate.
            </p>
          </div>
        ) : (
          <div className="pt-4">
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
    </>
  );
}
