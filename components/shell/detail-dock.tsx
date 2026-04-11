// components/shell/detail-dock.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useRequests } from "@/context/requests-context";
import { X, Activity } from "lucide-react";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { PredesignPanel } from "@/components/requests/predesign-panel";
import { DesignPhasePanel } from "@/components/requests/design-phase-panel";
import { DevPhasePanel } from "@/components/requests/dev-phase-panel";
import { TrackPhasePanel } from "@/components/requests/track-phase-panel";
import { ImpactRetrospectivePanel } from "@/components/requests/impact-retrospective-panel";
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
  ImpactRetrospective,
} from "@/db/schema";
import { getPhaseLabel, getStageLabel } from "@/lib/workflow";

interface EnrichedData {
  aiAnalysis: RequestAiAnalysis | null;
  comments: Comment[];
  authorMap: Record<string, { fullName: string | null }>;
  stageHistory: RequestStage[];
  existingBrief: RequestContextBrief | null;
  existingRetrospective: ImpactRetrospective | null;
  requesterName: string;
  project: { id: string; name: string; color: string } | null;
  canEdit: boolean;
}

const DOCK_WIDTH = 520;


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
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
};

const divider: React.CSSProperties = {
  borderTop: "1px solid hsl(var(--border))",
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
  const [activeTab, setActiveTab] = useState<"details" | "timeline">("details");


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

  const phaseLabel = getPhaseLabel((request.phase ?? "predesign") as import("@/db/schema").Phase);
  const stageKey =
    request.phase === "predesign" ? (request.predesignStage ?? "intake") :
    request.phase === "design"    ? (request.designStage ?? "sense") :
    request.phase === "dev"       ? (request.kanbanState ?? "todo") :
                                    (request.trackStage ?? "measuring");
  const stageLabel = getStageLabel(stageKey);
  const statusStyle = STATUS_COLORS[request.status] ?? { bg: "#F0EDE6", color: "#78716C" };

  return (
    <aside
      className="flex flex-col shrink-0 overflow-y-auto bg-card border-l border-border"
      style={{
        width: DOCK_WIDTH,
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
        className="flex items-start justify-between px-5 py-4 border-b border-border"
      >
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-muted-foreground/60" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, letterSpacing: "0.04em" }}>
            #{request.id.slice(0, 6).toUpperCase()}
          </p>
          <h2 className="text-foreground" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
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
            <span className="text-muted-foreground/60" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase" }}>
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
          <button onClick={close} className="shrink-0 rounded flex items-center justify-center transition-colors text-muted-foreground/60"
            style={{ width: 28, height: 28, background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 px-5 py-5">

        {/* ── Tab switcher ── */}
        <div className="flex gap-0 border-b border-border" style={{ marginBottom: -4 }}>
          {(["details", "timeline"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? "text-foreground" : "text-muted-foreground/60"}
              style={{
                fontSize: 12,
                fontWeight: 500,
                background: "none",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
                padding: "6px 12px 8px",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "color 150ms, border-color 150ms",
              }}
            >
              {tab === "timeline" && <Activity size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />}
              {tab === "details" ? "Details" : "Timeline"}
            </button>
          ))}
        </div>

        {/* ── Timeline tab content ── */}
        {activeTab === "timeline" && request && (
          <ActivityTimeline requestId={request.id} />
        )}

        {/* ── Details tab content ── */}
        {activeTab === "details" && <>

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
              currentDesignStage={(request.designStage ?? "sense") as "sense" | "frame" | "diverge" | "converge" | "prove"}
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
        {request.phase === "track" && enriched && (
          <div style={divider}>
            <ImpactRetrospectivePanel
              requestId={request.id}
              existingRetrospective={enriched.existingRetrospective}
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
            <p style={labelStyle} className="text-muted-foreground/60">Problem</p>
            <p className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {request.description}
            </p>
          </div>
        )}
        {request.businessContext && (
          <div>
            <p style={labelStyle} className="text-muted-foreground/60">Business context</p>
            <p className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {request.businessContext}
            </p>
          </div>
        )}
        {request.successMetrics && (
          <div>
            <p style={labelStyle} className="text-muted-foreground/60">Success metrics</p>
            <p className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {request.successMetrics}
            </p>
          </div>
        )}

        {/* ── Figma link + history ── */}
        {request.figmaUrl && (
          <div style={divider}>
            <p style={labelStyle} className="text-muted-foreground/60">Figma</p>
            <a href={request.figmaUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium text-primary no-underline">
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
              <p style={labelStyle} className="text-muted-foreground/60">AI Triage</p>
              <span className="text-muted-foreground/60" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9 }}>
                {enriched.aiAnalysis.aiModel}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground" style={{ fontSize: 12, lineHeight: 1.6 }}>
                {enriched.aiAnalysis.summary}
              </p>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p style={labelStyle} className="text-muted-foreground/60">Request quality</p>
                  <span style={{
                    fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 600,
                    color: enriched.aiAnalysis.qualityScore >= 70 ? "#166534" : enriched.aiAnalysis.qualityScore >= 40 ? "#B45309" : "#DC2626",
                  }}>
                    {enriched.aiAnalysis.qualityScore}/100
                  </span>
                </div>
                <div className="bg-accent" style={{ width: "100%", height: 4, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${enriched.aiAnalysis.qualityScore}%`, borderRadius: 2,
                    background: enriched.aiAnalysis.qualityScore >= 70 ? "#86A87A" : enriched.aiAnalysis.qualityScore >= 40 ? "#D4A84B" : "#E07070",
                  }} />
                </div>
              </div>
              {enriched.aiAnalysis.qualityFlags.length > 0 && (
                <div>
                  <p style={{ ...labelStyle, marginBottom: 6 }} className="text-muted-foreground/60">Issues</p>
                  <div className="flex flex-wrap gap-1">
                    {enriched.aiAnalysis.qualityFlags.map((flag, i) => (
                      <span key={i} className="rounded-sm" style={{ fontSize: 11, color: "#B45309", background: "#FEF3C7", border: "1px solid #FDE68A", padding: "2px 6px" }}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p style={{ ...labelStyle, marginBottom: 4 }} className="text-muted-foreground/60">Reasoning</p>
                <p className="text-muted-foreground/60" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  {enriched.aiAnalysis.reasoning}
                </p>
              </div>
              {enriched.aiAnalysis.suggestions.length > 0 && (
                <div>
                  <p style={{ ...labelStyle, marginBottom: 6 }} className="text-muted-foreground/60">Suggestions</p>
                  <ul className="space-y-1">
                    {enriched.aiAnalysis.suggestions.map((s, i) => (
                      <li key={i} className="text-muted-foreground" style={{ fontSize: 12, lineHeight: 1.5 }}>· {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {enriched.aiAnalysis.potentialDuplicates.length > 0 && (
                <div>
                  <p style={{ ...labelStyle, marginBottom: 6 }} className="text-muted-foreground/60">Potential duplicates</p>
                  <div className="space-y-1.5">
                    {enriched.aiAnalysis.potentialDuplicates.map((dup, i) => (
                      <Link key={i} href={`/dashboard/requests/${dup.id}`}
                        className="text-muted-foreground border border-border rounded-md no-underline"
                        style={{ display: "block", fontSize: 12, padding: "6px 10px" }}>
                        <span className="text-foreground" style={{ fontWeight: 500 }}>{dup.title}</span>
                        <span className="text-muted-foreground/60" style={{ marginLeft: 6 }}>{dup.reason}</span>
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
          <p style={{ ...labelStyle, marginBottom: 10 }} className="text-muted-foreground/60">Assignees</p>
          <AssignPanel requestId={request.id} />
        </div>

        {/* ── Meta grid ── */}
        <div style={divider}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={labelStyle} className="text-muted-foreground/60">Priority</p>
              <p style={metaValueStyle} className="text-muted-foreground">{request.priority ? PRIORITY_LABELS[request.priority] : "—"}</p>
            </div>
            <div>
              <p style={labelStyle} className="text-muted-foreground/60">Type</p>
              <p style={metaValueStyle} className="text-muted-foreground">{request.requestType ?? "—"}</p>
            </div>
            <div>
              <p style={labelStyle} className="text-muted-foreground/60">Due</p>
              <p style={metaValueStyle} className="text-muted-foreground">{formatDate(request.deadlineAt ?? null)}</p>
            </div>
            <div>
              <p style={labelStyle} className="text-muted-foreground/60">Created</p>
              <p style={metaValueStyle} className="text-muted-foreground">{formatDate(request.createdAt)}</p>
            </div>
            {request.complexity && (
              <div>
                <p style={labelStyle} className="text-muted-foreground/60">Complexity</p>
                <p style={metaValueStyle} className="text-muted-foreground">{request.complexity} / 5</p>
              </div>
            )}
            {request.impactPrediction && (
              <div>
                <p style={labelStyle} className="text-muted-foreground/60">Predicted impact</p>
                <p style={metaValueStyle} className="text-muted-foreground">{request.impactPrediction}</p>
              </div>
            )}
            {enriched?.requesterName && (
              <div className="col-span-2">
                <p style={labelStyle} className="text-muted-foreground/60">Submitted by</p>
                <p style={metaValueStyle} className="text-muted-foreground">{enriched.requesterName}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Stage history ── */}
        {enriched && enriched.stageHistory.length > 0 && (
          <div style={divider}>
            <p style={{ ...labelStyle, marginBottom: 8 }} className="text-muted-foreground/60">History</p>
            <div className="space-y-1.5">
              {enriched.stageHistory.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground" style={{ fontSize: 12, textTransform: "capitalize" }}>{s.stage}</span>
                  <span className="text-muted-foreground/60" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10 }}>
                    {new Date(s.completedAt ?? s.enteredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Activity / Comments ── */}
        <div style={divider}>
          <p style={{ ...labelStyle, marginBottom: enrichedLoading ? 8 : 10 }} className="text-muted-foreground/60">
            Activity{enriched ? ` (${enriched.comments.length})` : ""}
          </p>
          {enrichedLoading && (
            <p className="text-muted-foreground/60" style={{ fontSize: 12 }}>Loading…</p>
          )}
          {enriched && enriched.comments.length === 0 && (
            <p className="text-muted-foreground/60" style={{ fontSize: 12, marginBottom: 12 }}>No comments yet</p>
          )}
          {enriched && enriched.comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {enriched.comments.map((c) => {
                const author = c.authorId ? enriched.authorMap[c.authorId] : null;
                return (
                  <div key={c.id} className="border border-border rounded-md" style={{ padding: "10px 12px" }}>
                    <div className="flex items-center gap-2 mb-1">
                      {c.isSystem ? (
                        <span className="text-muted-foreground/60 bg-muted rounded-sm" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          system
                        </span>
                      ) : (
                        <span className="text-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                          {author?.fullName ?? "Unknown"}
                        </span>
                      )}
                      <span className="text-muted-foreground/60" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10 }}>
                        {c.createdAt ? formatDateTime(new Date(c.createdAt).toISOString()) : ""}
                      </span>
                    </div>
                    <p className="text-muted-foreground" style={{ fontSize: 12, lineHeight: 1.6 }}>{c.body}</p>
                  </div>
                );
              })}
            </div>
          )}
          <CommentBox requestId={request.id} />
        </div>

        </>}

        {/* ── Open full page ── */}
        <div className="border-t border-border" style={{ paddingTop: 12, textAlign: "center" }}>
          <Link href={`/dashboard/requests/${request.id}`} className="text-muted-foreground/60 no-underline" style={{ fontSize: 12 }}>
            Open full page →
          </Link>
        </div>

      </div>
    </aside>
  );
}
