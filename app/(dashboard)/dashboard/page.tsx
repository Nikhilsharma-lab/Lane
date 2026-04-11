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
import type { Request } from "@/db/schema";

// ── Priority badge helpers ──────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "'Geist Mono', monospace",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "1px 6px",
        borderRadius: 4,
        background: `var(--priority-${priority}-bg)`,
        color: `var(--priority-${priority}-text)`,
        flexShrink: 0,
      }}
    >
      {priority.toUpperCase()}
    </span>
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 20px",
        textDecoration: "none",
        transition: "background 0.1s",
      }}
      className="border-b hover:bg-muted"
    >
      {/* Title */}
      <span
        style={{
          flex: 1,
          fontFamily: "'Satoshi', sans-serif",
          fontSize: 13,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        className="text-foreground"
      >
        {request.title}
      </span>

      {/* Phase · Stage */}
      {phaseLabel && (
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          className="text-muted-foreground/60"
        >
          {phaseLabel} · {stageLabel}
        </span>
      )}

      {/* Priority badge */}
      <PriorityBadge priority={request.priority} />

      {/* First assignee */}
      {firstAssigneeName && (
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          className="text-muted-foreground/60"
        >
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
    <section aria-label={label} style={{ marginBottom: 24 }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 20px",
        }}
        className="border-b"
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
          className="text-muted-foreground"
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
          }}
          className="text-muted-foreground/60"
        >
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 40,
          padding: "0 20px",
          flexShrink: 0,
        }}
        className="border-b bg-card"
      >
        <span
          style={{
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
          className="text-foreground"
        >
          Home
        </span>
      </div>

      {/* ── Morning briefing ─────────────────────────────────────────────── */}
      <MorningBriefingCard brief={briefForCard} alertCount={inlineAlerts.length} />

      {/* ── Alerts ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "12px 20px 0" }}>
        <AlertsSection alerts={inlineAlerts} />
      </div>

      {/* ── Focus sections ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {isEmpty ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 20px",
            }}
          >
            <p
              style={{
                fontFamily: "'Satoshi', sans-serif",
                fontSize: 14,
                textAlign: "center",
                maxWidth: 320,
                lineHeight: 1.6,
              }}
              className="text-muted-foreground/60"
            >
              You&apos;re clear. Time to think, learn, or help a teammate.
            </p>
          </div>
        ) : (
          <div style={{ paddingTop: 16 }}>
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
