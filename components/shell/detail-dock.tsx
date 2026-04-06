// components/shell/detail-dock.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useRequests } from "@/context/requests-context";
import { X } from "lucide-react";
import { PredesignPanel } from "@/components/requests/predesign-panel";
import { DesignPhasePanel } from "@/components/requests/design-phase-panel";
import { DevPhasePanel } from "@/components/requests/dev-phase-panel";
import { TrackPhasePanel } from "@/components/requests/track-phase-panel";
import { AssignPanel } from "@/components/requests/assign-panel";
import { CommentBox } from "@/components/requests/comment-box";
import { HandoffChecklist } from "@/components/requests/handoff-checklist";
import { FigmaHistory } from "@/components/requests/figma-history";
import { TriageButton } from "@/components/requests/triage-button";
import { EditRequestButton } from "@/components/requests/edit-request-button";
import { ContextBriefPanel } from "@/components/requests/context-brief-panel";
import { ProjectBadge } from "@/components/projects/project-badge";
import { RealtimeRequest } from "@/components/realtime/realtime-request";
import type {
  RequestAiAnalysis,
  Comment,
  RequestStage,
  RequestContextBrief,
} from "@/db/schema";

interface EnrichedData {
  aiAnalysis: RequestAiAnalysis | null;
  comments: Comment[];
  authorMap: Record<string, { fullName: string | null }>;
  stageHistory: RequestStage[];
  existingBrief: RequestContextBrief | null;
  requesterName: string;
  project: { id: string; name: string; color: string } | null;
  canEdit: boolean;
}

const DOCK_WIDTH = 520;

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign", design: "Design", dev: "Dev", track: "Track",
};

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake", context: "Context", shape: "Shape", bet: "Betting",
  explore: "Explore", validate: "Validate", handoff: "Handoff",
  todo: "To Do", in_progress: "In Progress", in_review: "In Review", qa: "QA", done: "Done",
  measuring: "Measuring", complete: "Complete",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:       { bg: "#F0EDE6", color: "#78716C" },
  submitted:   { bg: "#EAF2EC", color: "#2E5339" },
  triaged:     { bg: "#E0ECF8", color: "#1E6091" },
  assigned:    { bg: "#EAF2EC", color: "#2E5339" },
  in_progress: { bg: "#DBEAFE", color: "#1D4ED8" },
  in_review:   { bg: "#FEF3C7", color: "#B45309" },
  blocked:     { bg: "#FEE2E2", color: "#DC2626" },
  completed:   { bg: "#EAF2EC", color: "#2E5339" },
  shipped:     { bg: "#EAF2EC", color: "#166534" },
};

const PRIORITY_LABELS: Record<string, string> = {
  p0: "P0 · Critical", p1: "P1 · High", p2: "P2 · Medium", p3: "P3 · Low",
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function toISOorNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

const labelStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
  fontWeight: 500,
};

const divider: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: 16,
  marginTop: 4,
};

export function DetailDock({ profileRole = "member", isTestUser = false }: { profileRole?: string; isTestUser?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requests = useRequests();

  const dockId = searchParams.get("dock");
  const request = dockId ? requests.find((r) => r.id === dockId) : null;

  const [enriched, setEnriched] = useState<EnrichedData | null>(null);
  const [enrichedLoading, setEnrichedLoading] = useState(false);


  // ── Enriched data fetch ──────────────────────────────────────────────────
  useEffect(() => {
    if (!dockId) { setEnriched(null); return; }
    setEnriched(null);
    setEnrichedLoading(true);
    fetch(`/api/requests/${dockId}/enriched`)
      .then((r) => r.json())
      .then((data) => setEnriched(data))
      .catch(() => {})
      .finally(() => setEnrichedLoading(false));
  }, [dockId]);

  if (!request) return null;

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("dock");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const phaseLabel = PHASE_LABELS[request.phase ?? "predesign"] ?? request.phase;
  const stageKey =
    request.phase === "predesign" ? (request.predesignStage ?? "intake") :
    request.phase === "design"    ? (request.designStage ?? "explore") :
    request.phase === "dev"       ? (request.kanbanState ?? "todo") :
                                    (request.trackStage ?? "measuring");
  const stageLabel = STAGE_LABELS[stageKey] ?? stageKey;
  const statusStyle = STATUS_COLORS[request.status] ?? { bg: "#F0EDE6", color: "#78716C" };

  return (
    <aside
      className="flex flex-col shrink-0 overflow-y-auto"
      style={{
        width: DOCK_WIDTH,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
        animation: "dockSlideIn 200ms ease-out",
      }}
    >
      {/* Realtime subscription — invisible, refreshes on any DB change */}
      <RealtimeRequest requestId={request.id} />

      {/* Header */}
      <div
        className="flex items-start justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex flex-col gap-1.5 min-w-0">
          <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>
            #{request.id.slice(0, 6).toUpperCase()}
          </p>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
            {request.title}
          </h2>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="rounded" style={{
              fontFamily: "'Geist Mono', monospace", fontSize: 9, fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "2px 6px", background: statusStyle.bg, color: statusStyle.color,
            }}>
              {request.status.replace(/_/g, " ")}
            </span>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {phaseLabel} · {stageLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {enriched?.canEdit && (
            <EditRequestButton request={{
              id: request.id,
              title: request.title,
              description: request.description,
              businessContext: request.businessContext,
              successMetrics: request.successMetrics,
              figmaUrl: request.figmaUrl,
              impactMetric: request.impactMetric,
              impactPrediction: request.impactPrediction,
              deadlineAt: toISOorNull(request.deadlineAt),
            }} />
          )}
          <button onClick={close} className="shrink-0 rounded flex items-center justify-center transition-colors"
            style={{ width: 28, height: 28, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 px-5 py-5">

        {/* ── Project badge ── */}
        {enriched?.project && (
          <ProjectBadge name={enriched.project.name} color={enriched.project.color} />
        )}

        {/* ── Phase panel ── */}
        {request.phase === "predesign" && (
          <div style={divider}>
            <PredesignPanel
              requestId={request.id}
              currentStage={(request.predesignStage ?? request.stage) as "intake" | "context" | "shape" | "bet"}
              description={request.description}
              businessContext={request.businessContext}
              successMetrics={request.successMetrics}
              profileRole={profileRole}
              impactMetric={request.impactMetric}
              impactPrediction={request.impactPrediction}
              existingConfidence={null}
            />
          </div>
        )}
        {request.phase === "design" && (
          <div style={divider}>
            <DesignPhasePanel
              requestId={request.id}
              currentDesignStage={(request.designStage ?? "explore") as "explore" | "validate" | "handoff"}
              figmaUrl={request.figmaUrl}
              profileRole={profileRole}
              isTestUser={isTestUser}
            />
          </div>
        )}
        {request.phase === "dev" && (
          <div style={divider}>
            <DevPhasePanel
              requestId={request.id}
              kanbanState={(request.kanbanState ?? "todo") as "todo" | "in_progress" | "in_review" | "qa" | "done"}
              figmaUrl={request.figmaUrl}
              figmaLockedAt={toISOorNull(request.figmaLockedAt)}
              devQuestionCount={enriched?.comments.filter((c) => c.isDevQuestion).length ?? 0}
            />
          </div>
        )}
        {request.phase === "track" && (
          <div style={divider}>
            <TrackPhasePanel
              requestId={request.id}
              trackStage={(request.trackStage ?? "measuring") as "measuring" | "complete"}
              impactMetric={request.impactMetric}
              impactPrediction={request.impactPrediction}
              impactActual={request.impactActual}
              initialVariancePercent={null}
            />
          </div>
        )}

        {/* ── Handoff checklist ── */}
        <div style={divider}>
          <HandoffChecklist requestId={request.id} stage={request.stage} />
        </div>

        {/* ── Description / Context ── */}
        {request.description && (
          <div style={divider}>
            <p style={labelStyle}>Problem</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.description}
            </p>
          </div>
        )}
        {request.businessContext && (
          <div>
            <p style={labelStyle}>Business context</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.businessContext}
            </p>
          </div>
        )}
        {request.successMetrics && (
          <div>
            <p style={labelStyle}>Success metrics</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {request.successMetrics}
            </p>
          </div>
        )}

        {/* ── Figma link + history ── */}
        {request.figmaUrl && (
          <div style={divider}>
            <p style={labelStyle}>Figma</p>
            <a href={request.figmaUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
              Open in Figma ↗
            </a>
          </div>
        )}
        {request.figmaUrl && (request.phase === "design" || request.phase === "dev" || request.phase === "track") && (
          <div style={divider}>
            <FigmaHistory requestId={request.id} phase={request.phase as string} />
          </div>
        )}

        {/* ── AI Context Brief (design phase) ── */}
        {request.phase === "design" && (
          <div style={divider}>
            <ContextBriefPanel
              requestId={request.id}
              existingBrief={enriched?.existingBrief ?? null}
            />
          </div>
        )}

        {/* ── AI Triage ── */}
        {enriched?.aiAnalysis && (
          <div style={divider}>
            <div className="flex items-center justify-between mb-3">
              <p style={labelStyle}>AI Triage</p>
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, color: "var(--text-tertiary)" }}>
                {enriched.aiAnalysis.aiModel}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {enriched.aiAnalysis.summary}
              </p>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p style={labelStyle}>Request quality</p>
                  <span style={{
                    fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 600,
                    color: enriched.aiAnalysis.qualityScore >= 70 ? "#166534" : enriched.aiAnalysis.qualityScore >= 40 ? "#B45309" : "#DC2626",
                  }}>
                    {enriched.aiAnalysis.qualityScore}/100
                  </span>
                </div>
                <div style={{ width: "100%", height: 4, background: "var(--bg-hover)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${enriched.aiAnalysis.qualityScore}%`, borderRadius: 2,
                    background: enriched.aiAnalysis.qualityScore >= 70 ? "#86A87A" : enriched.aiAnalysis.qualityScore >= 40 ? "#D4A84B" : "#E07070",
                  }} />
                </div>
              </div>
              {enriched.aiAnalysis.qualityFlags.length > 0 && (
                <div>
                  <p style={{ ...labelStyle, marginBottom: 6 }}>Issues</p>
                  <div className="flex flex-wrap gap-1">
                    {enriched.aiAnalysis.qualityFlags.map((flag, i) => (
                      <span key={i} style={{ fontSize: 11, color: "#B45309", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "var(--radius-sm)", padding: "2px 6px" }}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p style={{ ...labelStyle, marginBottom: 4 }}>Reasoning</p>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                  {enriched.aiAnalysis.reasoning}
                </p>
              </div>
              {enriched.aiAnalysis.suggestions.length > 0 && (
                <div>
                  <p style={{ ...labelStyle, marginBottom: 6 }}>Suggestions</p>
                  <ul className="space-y-1">
                    {enriched.aiAnalysis.suggestions.map((s, i) => (
                      <li key={i} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>· {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {enriched.aiAnalysis.potentialDuplicates.length > 0 && (
                <div>
                  <p style={{ ...labelStyle, marginBottom: 6 }}>Potential duplicates</p>
                  <div className="space-y-1.5">
                    {enriched.aiAnalysis.potentialDuplicates.map((dup, i) => (
                      <Link key={i} href={`/dashboard/requests/${dup.id}`}
                        style={{ display: "block", fontSize: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "6px 10px", color: "var(--text-secondary)", textDecoration: "none" }}>
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{dup.title}</span>
                        <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>{dup.reason}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {enriched && !enriched.aiAnalysis && (
          <div style={divider}>
            <TriageButton requestId={request.id} />
          </div>
        )}

        {/* ── Assignees ── */}
        <div style={divider}>
          <p style={{ ...labelStyle, marginBottom: 10 }}>Assignees</p>
          <AssignPanel requestId={request.id} />
        </div>

        {/* ── Meta grid ── */}
        <div style={divider}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={labelStyle}>Priority</p>
              <p style={metaValueStyle}>{request.priority ? PRIORITY_LABELS[request.priority] : "—"}</p>
            </div>
            <div>
              <p style={labelStyle}>Type</p>
              <p style={metaValueStyle}>{request.requestType ?? "—"}</p>
            </div>
            <div>
              <p style={labelStyle}>Due</p>
              <p style={metaValueStyle}>{formatDate(request.deadlineAt ?? null)}</p>
            </div>
            <div>
              <p style={labelStyle}>Created</p>
              <p style={metaValueStyle}>{formatDate(request.createdAt)}</p>
            </div>
            {request.complexity && (
              <div>
                <p style={labelStyle}>Complexity</p>
                <p style={metaValueStyle}>{request.complexity} / 5</p>
              </div>
            )}
            {request.impactPrediction && (
              <div>
                <p style={labelStyle}>Predicted impact</p>
                <p style={metaValueStyle}>{request.impactPrediction}</p>
              </div>
            )}
            {enriched?.requesterName && (
              <div className="col-span-2">
                <p style={labelStyle}>Submitted by</p>
                <p style={metaValueStyle}>{enriched.requesterName}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Stage history ── */}
        {enriched && enriched.stageHistory.length > 0 && (
          <div style={divider}>
            <p style={{ ...labelStyle, marginBottom: 8 }}>History</p>
            <div className="space-y-1.5">
              {enriched.stageHistory.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>{s.stage}</span>
                  <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "var(--text-tertiary)" }}>
                    {new Date(s.completedAt ?? s.enteredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Activity / Comments ── */}
        <div style={divider}>
          <p style={{ ...labelStyle, marginBottom: enrichedLoading ? 8 : 10 }}>
            Activity{enriched ? ` (${enriched.comments.length})` : ""}
          </p>
          {enrichedLoading && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading…</p>
          )}
          {enriched && enriched.comments.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>No comments yet</p>
          )}
          {enriched && enriched.comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {enriched.comments.map((c) => {
                const author = c.authorId ? enriched.authorMap[c.authorId] : null;
                return (
                  <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    <div className="flex items-center gap-2 mb-1">
                      {c.isSystem ? (
                        <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, color: "var(--text-tertiary)", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          system
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                          {author?.fullName ?? "Unknown"}
                        </span>
                      )}
                      <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "var(--text-tertiary)" }}>
                        {c.createdAt ? formatDateTime(new Date(c.createdAt).toISOString()) : ""}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{c.body}</p>
                  </div>
                );
              })}
            </div>
          )}
          <CommentBox requestId={request.id} />
        </div>

        {/* ── Open full page ── */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, textAlign: "center" }}>
          <Link href={`/dashboard/requests/${request.id}`} style={{ fontSize: 12, color: "var(--text-tertiary)", textDecoration: "none" }}>
            Open full page →
          </Link>
        </div>

      </div>
    </aside>
  );
}
