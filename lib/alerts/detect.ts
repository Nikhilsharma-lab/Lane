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
import { eq, and, lt, not, inArray, sql, or } from "drizzle-orm";

// ── Named thresholds ───────────────────────────────────────────────────────

const STALL_NUDGE_THRESHOLD_DAYS = 5;
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

// Returns true if a rule_key already has a non-expired alert row.
// Kept for detectFigmaDrift; stall/signoff detection now batches existence checks.
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
  type: "stall_nudge" | "signoff_overdue" | "figma_drift";
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
//
// Batched: 1 round-trip for the request list, then 1 for existing rule keys,
// then 3 parallel (comment maxes + stage maxes + lead assignments), then 1
// for designer profiles. Total: O(4) serial regardless of N. Previously was
// O(4×N) — a 50-request org went from 200 sequential DB hops to 4.
export async function detectStallNudges(orgId: string): Promise<AlertCandidate[]> {
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

  if (activeDesignRequests.length === 0) return [];

  const reqIds = activeDesignRequests.map((r) => r.id);
  const threshold = daysAgo(STALL_NUDGE_THRESHOLD_DAYS);

  // Dedup: fetch existing non-expired rule keys for any of this week's candidates.
  const candidateRuleKeys = reqIds.map((id) => `stall_nudge_${id}_${wk}`);
  const existingKeyRows = await db
    .select({ ruleKey: proactiveAlerts.ruleKey })
    .from(proactiveAlerts)
    .where(
      and(
        inArray(proactiveAlerts.ruleKey, candidateRuleKeys),
        not(lt(proactiveAlerts.expiresAt, new Date()))
      )
    );
  const existingRuleKeys = new Set(existingKeyRows.map((r) => r.ruleKey));

  // Parallel: last non-system comment per request, last stage entry per request,
  // lead assignment per request. All scoped to reqIds.
  const [commentMaxes, stageMaxes, leadAssignmentRows] = await Promise.all([
    db
      .select({
        requestId: comments.requestId,
        lastAt: sql<Date>`max(${comments.createdAt})`,
      })
      .from(comments)
      .where(
        and(
          inArray(comments.requestId, reqIds),
          eq(comments.isSystem, false)
        )
      )
      .groupBy(comments.requestId),
    db
      .select({
        requestId: requestStages.requestId,
        lastAt: sql<Date>`max(${requestStages.enteredAt})`,
      })
      .from(requestStages)
      .where(inArray(requestStages.requestId, reqIds))
      .groupBy(requestStages.requestId),
    db
      .select({
        requestId: assignments.requestId,
        assigneeId: assignments.assigneeId,
      })
      .from(assignments)
      .where(
        and(
          inArray(assignments.requestId, reqIds),
          eq(assignments.role, "lead")
        )
      ),
  ]);

  // Merge comment + stage maxes into a single last-activity timestamp per request.
  const lastActivityByReq = new Map<string, Date>();
  for (const c of commentMaxes) {
    lastActivityByReq.set(c.requestId, c.lastAt);
  }
  for (const s of stageMaxes) {
    const existing = lastActivityByReq.get(s.requestId);
    if (!existing || s.lastAt > existing) {
      lastActivityByReq.set(s.requestId, s.lastAt);
    }
  }

  const leadByReq = new Map<string, string>();
  for (const a of leadAssignmentRows) {
    leadByReq.set(a.requestId, a.assigneeId);
  }

  // Final batch: designer profile lookups for names.
  const designerIds = Array.from(new Set(leadAssignmentRows.map((a) => a.assigneeId)));
  const designerRows = designerIds.length
    ? await db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(inArray(profiles.id, designerIds))
    : [];
  const designerNameById = new Map(
    designerRows.map((d) => [d.id, d.fullName ?? "the designer"])
  );

  // In-memory join + filter.
  const candidates: AlertCandidate[] = [];
  for (const req of activeDesignRequests) {
    const ruleKey = `stall_nudge_${req.id}_${wk}`;
    if (existingRuleKeys.has(ruleKey)) continue;

    const lastActivity = lastActivityByReq.get(req.id) ?? null;
    if (lastActivity && lastActivity > threshold) continue;

    const assigneeId = leadByReq.get(req.id);
    if (!assigneeId) continue;

    const daysSince = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000)
      : null;

    candidates.push({
      type: "stall_nudge",
      requestId: req.id,
      requestTitle: req.title,
      recipientId: assigneeId,
      ruleKey,
      ctaUrl: `/dashboard/requests/${req.id}`,
      designerName: designerNameById.get(assigneeId) ?? "the designer",
      daysSinceActivity: daysSince ?? undefined,
      lastActivityDescription: lastActivity
        ? `Last activity was ${daysSince} days ago`
        : "No activity recorded",
    });
  }

  return candidates;
}

// ── 2. Sign-off overdue ────────────────────────────────────────────────────
// Request in validate stage 3+ days, not all 3 roles have signed.
// Recipients: each role that hasn't signed yet.
//
// Batched: 2 round-trips for the request list + org members, then 4 parallel
// (latest validate stages + signoffs + lead assignments + existing rule keys),
// then in-memory join. Total: O(3) serial. Previously O(2N + K + M).
export async function detectSignoffOverdue(orgId: string): Promise<AlertCandidate[]> {
  const validateRequests = await db
    .select({ id: requests.id, title: requests.title })
    .from(requests)
    .where(
      and(
        eq(requests.orgId, orgId),
        eq(requests.phase, "design"),
        eq(requests.designStage, "prove")
      )
    );

  if (validateRequests.length === 0) return [];

  const reqIds = validateRequests.map((r) => r.id);

  const orgMembers = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.orgId, orgId));

  const roleToProfileRole: Record<string, string[]> = {
    pm: ["pm"],
    design_head: ["lead", "admin"],
  };

  const threshold = daysAgo(SIGNOFF_OVERDUE_THRESHOLD_DAYS);
  const today = new Date().toISOString().slice(0, 10);
  const requiredRoles = ["designer", "pm", "design_head"] as const;

  // Build every candidate rule key upfront so we can dedup in one batch.
  const allCandidateRuleKeys = reqIds.flatMap((reqId) =>
    requiredRoles.map((role) => `signoff_overdue_${reqId}_${role}_${today}`)
  );

  // Parallel batch:
  // - Latest validate-stage entry per request (max(enteredAt) grouped).
  // - All signoffs across the validate requests.
  // - Lead assignment per request (for designer recipient lookup).
  // - Existing non-expired rule keys from the candidate set.
  const [stageRows, signoffRows, leadRows, existingKeyRows] = await Promise.all([
    db
      .select({
        requestId: requestStages.requestId,
        enteredAt: sql<Date>`max(${requestStages.enteredAt})`,
      })
      .from(requestStages)
      .where(
        and(
          inArray(requestStages.requestId, reqIds),
          eq(requestStages.stage, "validate")
        )
      )
      .groupBy(requestStages.requestId),
    db
      .select({
        requestId: validationSignoffs.requestId,
        signerRole: validationSignoffs.signerRole,
      })
      .from(validationSignoffs)
      .where(inArray(validationSignoffs.requestId, reqIds)),
    db
      .select({
        requestId: assignments.requestId,
        assigneeId: assignments.assigneeId,
      })
      .from(assignments)
      .where(
        and(
          inArray(assignments.requestId, reqIds),
          eq(assignments.role, "lead")
        )
      ),
    allCandidateRuleKeys.length
      ? db
          .select({ ruleKey: proactiveAlerts.ruleKey })
          .from(proactiveAlerts)
          .where(
            and(
              inArray(proactiveAlerts.ruleKey, allCandidateRuleKeys),
              not(lt(proactiveAlerts.expiresAt, new Date()))
            )
          )
      : Promise.resolve([]),
  ]);

  const stageByReq = new Map(stageRows.map((s) => [s.requestId, s.enteredAt]));

  const signedRolesByReq = new Map<string, Set<string>>();
  for (const s of signoffRows) {
    if (!signedRolesByReq.has(s.requestId)) {
      signedRolesByReq.set(s.requestId, new Set());
    }
    signedRolesByReq.get(s.requestId)!.add(s.signerRole);
  }

  const leadByReq = new Map(leadRows.map((a) => [a.requestId, a.assigneeId]));
  const existingRuleKeys = new Set(existingKeyRows.map((r) => r.ruleKey));

  // In-memory iteration
  const candidates: AlertCandidate[] = [];
  for (const req of validateRequests) {
    const stageEnteredAt = stageByReq.get(req.id);
    if (!stageEnteredAt) continue;
    if (stageEnteredAt > threshold) continue;

    const daysSince = Math.floor(
      (Date.now() - stageEnteredAt.getTime()) / 86400000
    );

    const signedRoles = signedRolesByReq.get(req.id) ?? new Set<string>();
    const pendingRoles = requiredRoles.filter((r) => !signedRoles.has(r));
    if (pendingRoles.length === 0) continue;

    for (const pendingRole of pendingRoles) {
      let recipientId: string | undefined;

      if (pendingRole === "designer") {
        recipientId = leadByReq.get(req.id);
      } else {
        const allowedRoles = roleToProfileRole[pendingRole];
        const match = orgMembers.find((m) => allowedRoles.includes(m.role ?? ""));
        recipientId = match?.id;
      }

      if (!recipientId) continue;

      const ruleKey = `signoff_overdue_${req.id}_${pendingRole}_${today}`;
      if (existingRuleKeys.has(ruleKey)) continue;

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
