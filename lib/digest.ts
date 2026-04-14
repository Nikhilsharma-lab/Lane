// lib/digest.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { db } from "@/db";
import { profiles, requests, assignments, impactRecords } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────

export type RecentPrediction = {
  requestId: string;
  requestTitle: string;
  predictedValue: string;
  actualValue: string | null;
  variancePercent: number;
  measuredAt: string | null;
};

export type PmCoachingNote = {
  pmId: string;
  fullName: string;
  note: string;
  avgVariancePercent: number;
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  trend: "improving" | "worsening" | "stable";
  predictionCount: number;
  recent: RecentPrediction[];
};

export type WeeklyDigest = {
  headline: string;
  shippedThisWeek: string;
  teamHealth: string;
  standout: string;
  recommendations: string[];
};

export type DigestResponse = {
  digest: WeeklyDigest;
  pmCoaching: PmCoachingNote[];
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function safeVariance(raw: unknown): number | null {
  const n = parseFloat(raw as string);
  return Number.isFinite(n) ? n : null;
}

const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function cycleDays(r: { createdAt: Date; updatedAt: Date }): number {
  return Math.max(
    0,
    Math.round(
      (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 86_400_000
    )
  );
}

function avgCycle(reqs: { createdAt: Date; updatedAt: Date }[]): number | null {
  if (!reqs.length) return null;
  return Math.round(reqs.reduce((s, r) => s + cycleDays(r), 0) / reqs.length);
}

type ImpactRow = typeof impactRecords.$inferSelect;
type RequestRow = typeof requests.$inferSelect;

function buildPmCalibration(
  measured: ImpactRow[],
  orgRequests: RequestRow[]
): {
  avgVariancePercent: number;
  trend: "improving" | "worsening" | "stable";
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  recent: RecentPrediction[];
  predictionCount: number;
} | null {
  if (!measured.length) return null;

  const validMeasured = measured.filter((r) => safeVariance(r.variancePercent) !== null);
  if (!validMeasured.length) return null;
  const variances = validMeasured.map((r) => safeVariance(r.variancePercent) as number);
  const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;

  let trend: "improving" | "worsening" | "stable" = "stable";
  if (validMeasured.length >= 4) {
    const mid = Math.floor(validMeasured.length / 2);
    const firstHalf =
      validMeasured.slice(0, mid).reduce((s, r) => s + Math.abs(safeVariance(r.variancePercent) as number), 0) / mid;
    const secondHalf =
      validMeasured.slice(mid).reduce((s, r) => s + Math.abs(safeVariance(r.variancePercent) as number), 0) /
      (validMeasured.length - mid);
    if (secondHalf < firstHalf - 5) trend = "improving";
    else if (secondHalf > firstHalf + 5) trend = "worsening";
  }

  const label: "well_calibrated" | "over_optimistic" | "under_optimistic" =
    Math.abs(avgVariance) <= 10
      ? "well_calibrated"
      : avgVariance < -10
      ? "over_optimistic"
      : "under_optimistic";

  const recent: RecentPrediction[] = validMeasured
    .slice(-5)
    .reverse()
    .map((r) => {
      const req = orgRequests.find((req) => req.id === r.requestId);
      return {
        requestId: r.requestId,
        requestTitle: req?.title ?? "Unknown request",
        predictedValue: r.predictedValue,
        actualValue: r.actualValue,
        variancePercent: safeVariance(r.variancePercent) ?? 0,
        measuredAt: r.measuredAt ? new Date(r.measuredAt).toISOString() : null,
      };
    });

  return {
    avgVariancePercent: Math.round(avgVariance * 10) / 10,
    trend,
    label,
    recent,
    predictionCount: validMeasured.length,
  };
}

// ── generateObject schema ─────────────────────────────────────────────────────

const digestWithCoachingSchema = z.object({
  headline: z.string().describe("One punchy sentence summarising the team's week"),
  shippedThisWeek: z.string().describe(
    "What shipped — list each item with designer name, cycle time, and actual vs predicted impact if available"
  ),
  teamHealth: z.string().describe(
    "Throughput (items shipped), avg cycle time, whether pace is improving or slipping"
  ),
  standout: z.string().describe(
    "Standout performer(s) this week — fastest output, most shipped, or highest-impact work. Name them directly."
  ),
  recommendations: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("2-3 direct, actionable coaching recommendations"),
  pmCoachingNotes: z
    .array(
      z.object({
        pmId: z.string().describe("Exact pmId string as provided in PM_CALIBRATION"),
        note: z
          .string()
          .describe(
            "1-3 sentence coaching note for this PM based on their prediction accuracy history"
          ),
      })
    )
    .describe("One note per PM listed in PM_CALIBRATION. Empty array if no PM data."),
});

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateDigestForOrg(orgId: string): Promise<DigestResponse> {
  const members = await db.select().from(profiles).where(eq(profiles.orgId, orgId));
  const orgRequests = await db.select().from(requests).where(eq(requests.orgId, orgId));
  const orgReqIds = orgRequests.map((r) => r.id);

  const allAssignments = orgReqIds.length
    ? await db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
          role: assignments.role,
        })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
    : [];

  const allImpactRecords = orgReqIds.length
    ? await db
        .select()
        .from(impactRecords)
        .where(inArray(impactRecords.requestId, orgReqIds))
    : [];

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));

  // Impact map: requestId → impact record (only those with actual values)
  const impactMap = Object.fromEntries(
    allImpactRecords
      .filter((r) => r.actualValue)
      .map((r) => [r.requestId, r])
  );

  // Lead designer per request
  // Maps requestId → lead assignee ID (for ID-based matching)
  const leadAssigneeByRequest: Record<string, string> = {};
  // Maps requestId → lead display name (for prompt strings)
  const leadNameByRequest: Record<string, string> = {};
  for (const a of allAssignments) {
    if (a.role === "lead") {
      leadAssigneeByRequest[a.requestId] = a.assigneeId;
      leadNameByRequest[a.requestId] = memberMap[a.assigneeId] ?? "Unknown";
    }
  }

  const now = Date.now();

  const shippedAll = orgRequests.filter(
    (r) => r.status === "shipped" || r.status === "completed" || r.trackStage === "complete"
  );
  const shippedThisWeek = shippedAll.filter(
    (r) => now - new Date(r.updatedAt).getTime() < ONE_WEEK_MS
  );
  const shippedLastWeek = shippedAll.filter((r) => {
    const age = now - new Date(r.updatedAt).getTime();
    return age >= ONE_WEEK_MS && age < TWO_WEEKS_MS;
  });

  const stalledRequests = orgRequests.filter((r) => {
    if (STALL_EXEMPT.has(r.status)) return false;
    return (now - new Date(r.updatedAt).getTime()) / 86_400_000 >= 5;
  });

  const activeByDesigner: Record<string, number> = {};
  for (const a of allAssignments) {
    const req = orgRequests.find((r) => r.id === a.requestId);
    if (!req || STALL_EXEMPT.has(req.status)) continue;
    if (a.role === "lead") {
      activeByDesigner[a.assigneeId] = (activeByDesigner[a.assigneeId] ?? 0) + 1;
    }
  }

  // Shipped items with actual impact for prompt
  const shippedItems = shippedThisWeek.map((r) => {
    const designer = leadNameByRequest[r.id] ?? "Unassigned";
    const days = cycleDays(r);
    const impact = impactMap[r.id];
    let impactStr = "";
    if (impact) {
      const v = safeVariance(impact.variancePercent);
      impactStr = ` → Actual: ${impact.actualValue}${v !== null ? ` (${v > 0 ? "+" : ""}${v.toFixed(1)}% vs prediction)` : ""}`;
    } else if (r.impactPrediction) {
      impactStr = ` → Predicted: ${r.impactPrediction} (not yet measured)`;
    }
    return `• "${r.title}" — ${designer}, ${days}d cycle time${impactStr}`;
  });

  const designerSummaries = members
    .filter((m) => m.role === "designer" || m.role === "lead")
    .map((m) => {
      const active = activeByDesigner[m.id] ?? 0;
      const shipped = shippedThisWeek.filter(
        (r) => leadAssigneeByRequest[r.id] === m.id
      ).length;
      return `${m.fullName} (${m.role}): ${active} active, ${shipped} shipped this week`;
    });

  const stalledList = stalledRequests.map((r) => {
    const days = Math.floor((now - new Date(r.updatedAt).getTime()) / 86_400_000);
    return `• "${r.title}" — ${leadNameByRequest[r.id] ?? "Unassigned"}, stuck ${days}d`;
  });

  const shippedThisWeekAvgCycle = avgCycle(shippedThisWeek);
  const shippedLastWeekAvgCycle = avgCycle(shippedLastWeek);
  const throughputTrend =
    shippedLastWeekAvgCycle !== null && shippedThisWeekAvgCycle !== null
      ? shippedThisWeekAvgCycle < shippedLastWeekAvgCycle
        ? "improving (cycle time down)"
        : shippedThisWeekAvgCycle > shippedLastWeekAvgCycle
        ? "slowing (cycle time up)"
        : "steady"
      : "insufficient data for trend";

  // ── PM calibration data ────────────────────────────────────────────────────

  // Group measured records by PM
  const byPm: Record<string, ImpactRow[]> = {};
  for (const rec of allImpactRecords) {
    if (!rec.actualValue || rec.variancePercent === null) continue;
    const pmId = rec.pmId;
    if (!pmId) continue;
    if (!byPm[pmId]) byPm[pmId] = [];
    byPm[pmId].push(rec);
  }

  type CalibrationEntry = {
    pmId: string;
    fullName: string;
    calibration: NonNullable<ReturnType<typeof buildPmCalibration>>;
  };

  const pmCalibrationData: CalibrationEntry[] = [];
  for (const [pmId, records] of Object.entries(byPm)) {
    const member = members.find((m) => m.id === pmId);
    if (!member) continue;
    const cal = buildPmCalibration(records, orgRequests);
    if (cal) pmCalibrationData.push({ pmId, fullName: member.fullName ?? "Unknown PM", calibration: cal });
  }

  // Build prompt lines for PM coaching
  const pmSummaryLines = pmCalibrationData.map(
    ({ pmId, fullName, calibration }) =>
      `pmId: ${pmId} | Name: ${fullName} | ${calibration.predictionCount} predictions | avg variance: ${calibration.avgVariancePercent > 0 ? "+" : ""}${calibration.avgVariancePercent}% | label: ${calibration.label} | trend: ${calibration.trend}`
  );

  // ── Claude call ────────────────────────────────────────────────────────────

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: digestWithCoachingSchema,
    prompt: `You are a design ops AI writing the weekly digest and PM coaching notes for a design team lead.

TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

SHIPPED THIS WEEK (${shippedThisWeek.length} items):
${shippedItems.length ? shippedItems.join("\n") : "Nothing shipped this week."}

SHIPPED LAST WEEK: ${shippedLastWeek.length} items
THROUGHPUT TREND: ${throughputTrend}
This week avg cycle: ${shippedThisWeekAvgCycle !== null ? `${shippedThisWeekAvgCycle} days` : "n/a"}
Last week avg cycle: ${shippedLastWeekAvgCycle !== null ? `${shippedLastWeekAvgCycle} days` : "n/a"}

DESIGNER WORKLOAD:
${designerSummaries.length ? designerSummaries.join("\n") : "No designers yet."}

STALLED (5+ days no update):
${stalledList.length ? stalledList.join("\n") : "None."}

TOTAL PIPELINE: ${orgRequests.length} requests

PM_CALIBRATION (for pmCoachingNotes — use exact pmId values):
${pmSummaryLines.length ? pmSummaryLines.join("\n") : "No PM impact data yet — return empty pmCoachingNotes array."}

Write the weekly digest. Be specific — name people and requests. This is a private internal report for the design lead, not a PR document. Flag real problems plainly.

For pmCoachingNotes: write one note per PM in PM_CALIBRATION. Use the exact pmId string. Be direct and actionable in 1-3 sentences.`,
  });

  // ── Merge AI coaching with calculated calibration data ─────────────────────

  const { pmCoachingNotes, ...digestFields } = object;

  const pmCoaching: PmCoachingNote[] = pmCalibrationData.map(({ pmId, fullName, calibration }) => {
    const aiNote = pmCoachingNotes.find((n) => n.pmId === pmId);
    return {
      pmId,
      fullName,
      note: aiNote?.note ?? "Insufficient data for coaching recommendation.",
      avgVariancePercent: calibration.avgVariancePercent,
      label: calibration.label,
      trend: calibration.trend,
      predictionCount: calibration.predictionCount,
      recent: calibration.recent,
    };
  });

  return { digest: digestFields, pmCoaching };
}
