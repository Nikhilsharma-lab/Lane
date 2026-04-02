import type { Request } from "@/db/schema/requests";
import type { Profile } from "@/db/schema/users";

// ─── Serialisable output types ─────────────────────────────────────────────

export type DesignerStatus = "in-flow" | "idle" | "stuck" | "blocked" | "no-work";

export type RadarDesigner = {
  id: string;
  fullName: string;
  managerId: string | null;
  status: DesignerStatus;
  activeCount: number;
  /** Staleness of the most-recently-updated active request (ms). Null when no active work. */
  lastMovedMs: number | null;
  /** ID of the most-stalled active request — target for Nudge and Mark at-risk actions. */
  mostStalledRequestId: string | null;
  /** Current status of that request, needed for toggle-blocked body. */
  mostStalledRequestStatus: string | null;
  /** Title + stale days of the blocked request for display. Null when not blocked. */
  blockedTitle: string | null;
};

export type RiskRow = {
  requestId: string;
  title: string;
  priority: string | null;
  phase: string;
  designerName: string;
  staleDays: number;
};

export type FigmaDriftRow = {
  requestId: string;
  title: string;
  priority: string | null;
  unreviewedCount: number;
};

export type ShippedCard = {
  requestId: string;
  title: string;
  designerName: string;
  fullDays: number;
  designDays: number | null;
  devDays: number | null;
};

export type PhaseHeatMap = {
  predesign: number;
  design: number;
  dev: number;
  track: number;
};

// ─── Internal helpers ──────────────────────────────────────────────────────

const ACTIVE_PHASES = new Set(["predesign", "design", "dev"]);

function isActive(r: Request): boolean {
  return ACTIVE_PHASES.has(r.phase ?? "") && r.status !== "draft";
}

// ─── Public functions ──────────────────────────────────────────────────────

/**
 * Classify a single designer's status from their active requests.
 * Blocked overrides time-based signals.
 * - blocked: any active request has status === 'blocked'
 * - stuck: most recently updated request was > 5 days ago
 * - idle: most recently updated request was 2-4 days ago
 * - in-flow: most recently updated request was < 2 days ago
 * - no-work: no active requests at all
 */
export function classifyDesignerStatus(activeRequests: Request[]): DesignerStatus {
  if (activeRequests.length === 0) return "no-work";
  if (activeRequests.some((r) => r.status === "blocked")) return "blocked";

  const now = Date.now();
  const mostRecentMs = Math.max(
    ...activeRequests.map((r) => new Date(r.updatedAt).getTime())
  );
  const staleMs = now - mostRecentMs;

  if (staleMs >= 5 * 86_400_000) return "stuck";
  if (staleMs >= 2 * 86_400_000) return "idle";
  return "in-flow";
}

/**
 * Build one RadarDesigner row per designer/lead profile.
 * allAssignments: flat list from the assignments table (requestId + assigneeId only).
 */
export function buildDesignerRows(
  allProfiles: Profile[],
  allRequests: Request[],
  allAssignments: Array<{ requestId: string; assigneeId: string }>
): RadarDesigner[] {
  const designers = allProfiles.filter(
    (p) => p.role === "designer" || p.role === "lead"
  );

  // assigneeId → Set of requestIds
  const assignedIds = new Map<string, Set<string>>();
  for (const a of allAssignments) {
    if (!assignedIds.has(a.assigneeId)) assignedIds.set(a.assigneeId, new Set());
    assignedIds.get(a.assigneeId)!.add(a.requestId);
  }

  const requestMap = new Map(allRequests.map((r) => [r.id, r]));
  const now = Date.now();

  return designers.map((profile) => {
    const reqIds = assignedIds.get(profile.id) ?? new Set<string>();
    const activeRequests = [...reqIds]
      .map((id) => requestMap.get(id))
      .filter((r): r is Request => !!r && isActive(r));

    const status = classifyDesignerStatus(activeRequests);

    // Most stalled = oldest updatedAt
    const mostStalled =
      activeRequests.length > 0
        ? activeRequests.reduce((a, b) =>
            new Date(a.updatedAt).getTime() < new Date(b.updatedAt).getTime() ? a : b
          )
        : null;

    const lastMovedMs = mostStalled
      ? now - new Date(mostStalled.updatedAt).getTime()
      : null;

    // Blocked request info for card display
    const blockedReq = activeRequests.find((r) => r.status === "blocked");
    const blockedStaleDays = blockedReq
      ? Math.floor((now - new Date(blockedReq.updatedAt).getTime()) / 86_400_000)
      : null;

    return {
      id: profile.id,
      fullName: profile.fullName,
      managerId: profile.managerId ?? null,
      status,
      activeCount: activeRequests.length,
      lastMovedMs,
      mostStalledRequestId: mostStalled?.id ?? null,
      mostStalledRequestStatus: mostStalled?.status ?? null,
      blockedTitle:
        blockedReq && blockedStaleDays !== null
          ? `${blockedReq.title} (${blockedStaleDays}d)`
          : null,
    };
  });
}

/**
 * Count org requests per phase for the heat map.
 * Excludes draft and completed/shipped.
 */
export function getPhaseHeatMap(allRequests: Request[]): PhaseHeatMap {
  const counts: PhaseHeatMap = { predesign: 0, design: 0, dev: 0, track: 0 };
  for (const r of allRequests) {
    if (r.status === "draft" || r.status === "completed" || r.status === "shipped") continue;
    const p = (r.phase ?? "predesign") as keyof PhaseHeatMap;
    if (p in counts) counts[p]++;
  }
  return counts;
}

/**
 * Build the three risk categories.
 * designerByRequest: requestId → designer display name (derived from assignments + profileMap in the page).
 */
export function getRiskItems(
  allRequests: Request[],
  driftUpdates: Array<{ requestId: string; postHandoff: boolean; devReviewed: boolean }>,
  designerByRequest: Record<string, string>
): { stalled: RiskRow[]; signOffOverdue: RiskRow[]; figmaDrift: FigmaDriftRow[] } {
  const now = Date.now();

  const stalled: RiskRow[] = allRequests
    .filter((r) => isActive(r) && now - new Date(r.updatedAt).getTime() >= 5 * 86_400_000)
    .map((r) => ({
      requestId: r.id,
      title: r.title,
      priority: r.priority ?? null,
      phase: r.phase ?? "predesign",
      designerName: designerByRequest[r.id] ?? "Unassigned",
      staleDays: Math.floor((now - new Date(r.updatedAt).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.staleDays - a.staleDays);

  const signOffOverdue: RiskRow[] = allRequests
    .filter(
      (r) =>
        isActive(r) &&
        r.designStage === "validate" &&
        now - new Date(r.updatedAt).getTime() >= 3 * 86_400_000
    )
    .map((r) => ({
      requestId: r.id,
      title: r.title,
      priority: r.priority ?? null,
      phase: "design",
      designerName: designerByRequest[r.id] ?? "Unassigned",
      staleDays: Math.floor((now - new Date(r.updatedAt).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.staleDays - a.staleDays);

  // Group post-handoff unreviewed drift updates by request
  const driftCount = new Map<string, number>();
  for (const fu of driftUpdates) {
    if (!fu.postHandoff || fu.devReviewed) continue;
    driftCount.set(fu.requestId, (driftCount.get(fu.requestId) ?? 0) + 1);
  }

  const figmaDrift: FigmaDriftRow[] = [];
  for (const [requestId, count] of driftCount) {
    const req = allRequests.find((r) => r.id === requestId);
    if (!req) continue;
    figmaDrift.push({
      requestId,
      title: req.title,
      priority: req.priority ?? null,
      unreviewedCount: count,
    });
  }

  return { stalled, signOffOverdue, figmaDrift };
}

/**
 * Compute cycle times for a single request.
 * stages: filtered entries for this request from the request_stages table (old flat stage model).
 * Returns null for design/dev if data is unavailable — never crashes.
 *
 * Design cycle: 'explore' stage entry → figmaLockedAt (when design was handed off)
 * Dev cycle: figmaLockedAt → updatedAt (when phase became track)
 * Full cycle: createdAt → updatedAt
 */
export function computeCycleTimes(
  request: Request,
  stages: Array<{ stage: string; enteredAt: Date | string }>
): { fullDays: number; designDays: number | null; devDays: number | null } {
  const shippedAt = new Date(request.updatedAt).getTime();
  const createdAt = new Date(request.createdAt).getTime();
  const fullDays = Math.max(1, Math.ceil((shippedAt - createdAt) / 86_400_000));

  // Design cycle: 'explore' stage entry (legacy request_stages table) → figmaLockedAt
  const exploreEntry = stages.find((s) => s.stage === "explore");
  const designStart = exploreEntry ? new Date(exploreEntry.enteredAt).getTime() : null;
  const handoffAt = request.figmaLockedAt ? new Date(request.figmaLockedAt).getTime() : null;

  const designDays =
    designStart !== null && handoffAt !== null
      ? Math.max(1, Math.ceil((handoffAt - designStart) / 86_400_000))
      : null;

  const devDays =
    handoffAt !== null
      ? Math.max(1, Math.ceil((shippedAt - handoffAt) / 86_400_000))
      : null;

  return { fullDays, designDays, devDays };
}

/**
 * Requests that reached the track phase within the last 7 days.
 * Uses updatedAt as proxy for when phase became track.
 */
export function getShippedThisWeek(
  allRequests: Request[],
  allStages: Array<{ requestId: string; stage: string; enteredAt: Date | string }>,
  designerByRequest: Record<string, string>
): ShippedCard[] {
  const now = Date.now();
  return allRequests
    .filter((r) => r.phase === "track" && now - new Date(r.updatedAt).getTime() <= 7 * 86_400_000)
    .map((r) => {
      const stages = allStages.filter((s) => s.requestId === r.id);
      const { fullDays, designDays, devDays } = computeCycleTimes(r, stages);
      return {
        requestId: r.id,
        title: r.title,
        designerName: designerByRequest[r.id] ?? "Unknown",
        fullDays,
        designDays,
        devDays,
      };
    });
}

/**
 * Returns a canAction predicate for the radar page.
 * Design Head (lead/admin with no managerId): can act on all designers.
 * Team Lead (lead with managerId set): can act only on direct reports.
 * Everyone else: read-only.
 */
export function makeCanAction(
  viewer: Profile,
  allProfiles: Profile[]
): (designerId: string) => boolean {
  const isDesignHead =
    (viewer.role === "lead" || viewer.role === "admin") && !viewer.managerId;
  if (isDesignHead) return () => true;

  if (viewer.role === "lead" && viewer.managerId) {
    return (designerId: string) => {
      const designer = allProfiles.find((p) => p.id === designerId);
      return designer?.managerId === viewer.id;
    };
  }

  return () => false;
}
