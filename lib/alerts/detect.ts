// lib/alerts/detect.ts
import { db } from "@/db";
import {
  requests,
  profiles,
  assignments,
  comments,
  validationSignoffs,
  figmaUpdates,
  proactiveAlerts,
  requestStages,
} from "@/db/schema";
import { eq, and, lt, not, inArray, desc, gt, or } from "drizzle-orm";

// ── Named thresholds ───────────────────────────────────────────────────────

const STALL_NUDGE_THRESHOLD_DAYS = 5;
const ESCALATION_THRESHOLD_DAYS = 2;
const SIGNOFF_OVERDUE_THRESHOLD_DAYS = 3;
const FIGMA_DRIFT_THRESHOLD_HOURS = 24;

// ── Helpers ────────────────────────────────────────────────────────────────

// Returns ISO year+week string e.g. "2026-w15" — used in dedup rule keys
function weekKey(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-w${weekNo}`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

// Returns the most recent activity timestamp for a request
// Activity = any non-system comment OR any request_stages entry
async function getLastActivityAt(requestId: string): Promise<Date | null> {
  const [[lastComment], [lastStage]] = await Promise.all([
    db
      .select({ createdAt: comments.createdAt })
      .from(comments)
      .where(and(eq(comments.requestId, requestId), eq(comments.isSystem, false)))
      .orderBy(desc(comments.createdAt))
      .limit(1),
    db
      .select({ enteredAt: requestStages.enteredAt })
      .from(requestStages)
      .where(eq(requestStages.requestId, requestId))
      .orderBy(desc(requestStages.enteredAt))
      .limit(1),
  ]);

  const commentTs = lastComment?.createdAt ?? null;
  const stageTs = lastStage?.enteredAt ?? null;

  if (!commentTs && !stageTs) return null;
  if (!commentTs) return stageTs;
  if (!stageTs) return commentTs;
  return commentTs > stageTs ? commentTs : stageTs;
}

// Returns true if a rule_key already has a non-expired alert row
async function ruleKeyExists(ruleKey: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: proactiveAlerts.id })
    .from(proactiveAlerts)
    .where(
      and(
        eq(proactiveAlerts.ruleKey, ruleKey),
        not(lt(proactiveAlerts.expiresAt, new Date()))
      )
    )
    .limit(1);
  return !!existing;
}

// ── AlertCandidate type ────────────────────────────────────────────────────

export interface AlertCandidate {
  type: "stall_nudge" | "stall_escalation" | "signoff_overdue" | "figma_drift";
  requestId: string;
  requestTitle: string;
  recipientId: string;
  ruleKey: string;
  ctaUrl: string;
  // Extra context for AI copy generation
  designerName?: string;
  daysSinceActivity?: number;
  lastActivityDescription?: string;
  pendingSignoffRoles?: string[];
  daysSinceValidationRequested?: number;
  figmaChangeDescription?: string;
  hoursSinceFigmaChange?: number;
}

// ── 1. Stall nudge ─────────────────────────────────────────────────────────
// Design-phase requests with no activity for 5+ days.
// Recipient: assigned designer (private).
export async function detectStallNudges(orgId: string): Promise<AlertCandidate[]> {
  const candidates: AlertCandidate[] = [];
  const wk = weekKey();

  const activeDesignRequests = await db
    .select({ id: requests.id, title: requests.title })
    .from(requests)
    .where(
      and(
        eq(requests.orgId, orgId),
        eq(requests.phase, "design")
      )
    );

  for (const req of activeDesignRequests) {
    const ruleKey = `stall_nudge_${req.id}_${wk}`;
    if (await ruleKeyExists(ruleKey)) continue;

    const lastActivity = await getLastActivityAt(req.id);
    if (lastActivity && lastActivity > daysAgo(STALL_NUDGE_THRESHOLD_DAYS)) continue;

    const [assignment] = await db
      .select({ assigneeId: assignments.assigneeId })
      .from(assignments)
      .where(
        and(
          eq(assignments.requestId, req.id),
          eq(assignments.role, "lead")
        )
      )
      .limit(1);
    if (!assignment) continue;

    const [designer] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, assignment.assigneeId));

    const daysSince = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000)
      : null;

    candidates.push({
      type: "stall_nudge",
      requestId: req.id,
      requestTitle: req.title,
      recipientId: assignment.assigneeId,
      ruleKey,
      ctaUrl: `/dashboard/requests/${req.id}`,
      designerName: designer?.fullName ?? "the designer",
      daysSinceActivity: daysSince ?? undefined,
      lastActivityDescription: lastActivity
        ? `Last activity was ${daysSince} days ago`
        : "No activity recorded",
    });
  }

  return candidates;
}

// ── 2. Stall escalation ────────────────────────────────────────────────────
// stall_nudge was sent 2+ days ago and still no movement.
// Recipient: org Design Head (lead/admin role).
export async function detectStallEscalations(orgId: string): Promise<AlertCandidate[]> {
  const candidates: AlertCandidate[] = [];
  const wk = weekKey();

  const recentNudges = await db
    .select({
      requestId: proactiveAlerts.requestId,
      generatedAt: proactiveAlerts.generatedAt,
      recipientId: proactiveAlerts.recipientId,
    })
    .from(proactiveAlerts)
    .where(
      and(
        eq(proactiveAlerts.orgId, orgId),
        eq(proactiveAlerts.type, "stall_nudge"),
        eq(proactiveAlerts.dismissed, false),
        lt(proactiveAlerts.generatedAt, daysAgo(ESCALATION_THRESHOLD_DAYS))
      )
    );

  const [lead] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.orgId, orgId),
        or(eq(profiles.role, "lead"), eq(profiles.role, "admin"))
      )
    )
    .limit(1);
  if (!lead) return candidates;

  for (const nudge of recentNudges) {
    if (!nudge.requestId) continue;

    const ruleKey = `stall_escalation_${nudge.requestId}_${wk}`;
    if (await ruleKeyExists(ruleKey)) continue;

    const lastActivity = await getLastActivityAt(nudge.requestId);
    if (lastActivity && lastActivity > nudge.generatedAt) continue;

    const [req] = await db
      .select({ id: requests.id, title: requests.title })
      .from(requests)
      .where(eq(requests.id, nudge.requestId));
    if (!req) continue;

    const [designer] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, nudge.recipientId));

    const daysSince = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000)
      : null;

    candidates.push({
      type: "stall_escalation",
      requestId: req.id,
      requestTitle: req.title,
      recipientId: lead.id,
      ruleKey,
      ctaUrl: `/dashboard/requests/${req.id}`,
      designerName: designer?.fullName ?? "the designer",
      daysSinceActivity: daysSince ?? undefined,
      lastActivityDescription: lastActivity
        ? `Still no movement after nudge. Last activity was ${daysSince} days ago.`
        : "No activity recorded on this request.",
    });
  }

  return candidates;
}

// ── 3. Sign-off overdue ────────────────────────────────────────────────────
// Request in validate stage 3+ days, not all 3 roles have signed.
// Recipients: each role that hasn't signed yet.
export async function detectSignoffOverdue(orgId: string): Promise<AlertCandidate[]> {
  const candidates: AlertCandidate[] = [];

  const validateRequests = await db
    .select({ id: requests.id, title: requests.title })
    .from(requests)
    .where(
      and(
        eq(requests.orgId, orgId),
        eq(requests.phase, "design"),
        eq(requests.designStage, "refine")
      )
    );

  const orgMembers = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.orgId, orgId));

  const roleToProfileRole: Record<string, string[]> = {
    pm: ["pm"],
    design_head: ["lead", "admin"],
  };

  for (const req of validateRequests) {
    const [validateStage] = await db
      .select({ enteredAt: requestStages.enteredAt })
      .from(requestStages)
      .where(
        and(
          eq(requestStages.requestId, req.id),
          eq(requestStages.stage, "validate")
        )
      )
      .orderBy(desc(requestStages.enteredAt))
      .limit(1);

    if (!validateStage) continue;
    if (validateStage.enteredAt > daysAgo(SIGNOFF_OVERDUE_THRESHOLD_DAYS)) continue;

    const daysSince = Math.floor(
      (Date.now() - validateStage.enteredAt.getTime()) / 86400000
    );

    const existingSignoffs = await db
      .select({ signerRole: validationSignoffs.signerRole })
      .from(validationSignoffs)
      .where(eq(validationSignoffs.requestId, req.id));

    const signedRoles = new Set(existingSignoffs.map((s) => s.signerRole));
    const requiredRoles = ["designer", "pm", "design_head"] as const;
    const pendingRoles = requiredRoles.filter((r) => !signedRoles.has(r));

    if (pendingRoles.length === 0) continue;

    for (const pendingRole of pendingRoles) {
      let recipientId: string | undefined;

      if (pendingRole === "designer") {
        const [assignment] = await db
          .select({ assigneeId: assignments.assigneeId })
          .from(assignments)
          .where(
            and(
              eq(assignments.requestId, req.id),
              eq(assignments.role, "lead")
            )
          )
          .limit(1);
        recipientId = assignment?.assigneeId;
      } else {
        const allowedRoles = roleToProfileRole[pendingRole];
        const match = orgMembers.find((m) => allowedRoles.includes(m.role ?? ""));
        recipientId = match?.id;
      }

      if (!recipientId) continue;

      const today = new Date().toISOString().slice(0, 10);
      const ruleKey = `signoff_overdue_${req.id}_${pendingRole}_${today}`;
      if (await ruleKeyExists(ruleKey)) continue;

      candidates.push({
        type: "signoff_overdue",
        requestId: req.id,
        requestTitle: req.title,
        recipientId,
        ruleKey,
        ctaUrl: `/dashboard/requests/${req.id}`,
        pendingSignoffRoles: [...pendingRoles],
        daysSinceValidationRequested: daysSince,
      });
    }
  }

  return candidates;
}

// ── 4. Figma drift ─────────────────────────────────────────────────────────
// Post-handoff Figma change unreviewed for 24h+.
// Recipients: assigned dev (devOwnerId) + Design Head.
export async function detectFigmaDrift(orgId: string): Promise<AlertCandidate[]> {
  const candidates: AlertCandidate[] = [];

  const devRequests = await db
    .select({ id: requests.id, title: requests.title, devOwnerId: requests.devOwnerId })
    .from(requests)
    .where(
      and(
        eq(requests.orgId, orgId),
        eq(requests.phase, "dev")
      )
    );

  const devRequestIds = devRequests.map((r) => r.id);
  if (devRequestIds.length === 0) return candidates;

  const driftUpdates = await db
    .select()
    .from(figmaUpdates)
    .where(
      and(
        inArray(figmaUpdates.requestId, devRequestIds),
        eq(figmaUpdates.postHandoff, true),
        eq(figmaUpdates.devReviewed, false),
        lt(figmaUpdates.createdAt, hoursAgo(FIGMA_DRIFT_THRESHOLD_HOURS))
      )
    );

  const [lead] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.orgId, orgId),
        or(eq(profiles.role, "lead"), eq(profiles.role, "admin"))
      )
    )
    .limit(1);

  for (const update of driftUpdates) {
    const req = devRequests.find((r) => r.id === update.requestId);
    if (!req) continue;

    const hoursSince = Math.floor(
      (Date.now() - update.createdAt.getTime()) / 3600000
    );

    if (req.devOwnerId) {
      const ruleKey = `figma_drift_${update.id}_${req.devOwnerId}`;
      if (!(await ruleKeyExists(ruleKey))) {
        candidates.push({
          type: "figma_drift",
          requestId: req.id,
          requestTitle: req.title,
          recipientId: req.devOwnerId,
          ruleKey,
          ctaUrl: `/dashboard/requests/${req.id}`,
          figmaChangeDescription: update.changeDescription ?? "Figma file updated",
          hoursSinceFigmaChange: hoursSince,
        });
      }
    }

    if (lead) {
      const ruleKey = `figma_drift_${update.id}_${lead.id}`;
      if (!(await ruleKeyExists(ruleKey))) {
        candidates.push({
          type: "figma_drift",
          requestId: req.id,
          requestTitle: req.title,
          recipientId: lead.id,
          ruleKey,
          ctaUrl: `/dashboard/requests/${req.id}`,
          figmaChangeDescription: update.changeDescription ?? "Figma file updated",
          hoursSinceFigmaChange: hoursSince,
        });
      }
    }
  }

  return candidates;
}
