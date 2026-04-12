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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type {
  RequestAiAnalysis,
  Comment,
  RequestStage,
  RequestContextBrief,
  ImpactRetrospective,
} from "@/db/schema";
import { getPhaseLabel, getStageLabel } from "@/lib/workflow";
import { STATUS_STYLE } from "@/lib/theme-colors";

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

// ── Reusable label component ─────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] font-medium tracking-[0.07em] uppercase mb-1 text-muted-foreground/60">
      {children}
    </p>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export function DetailDock({ profileRole = "member", isTestUser = false }: { profileRole?: string; isTestUser?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requests = useRequests();

  const dockId = searchParams.get("dock");
  const request = dockId ? requests.find((r) => r.id === dockId) : null;

  const [enriched, setEnriched] = useState<EnrichedData | null>(null);
  const [enrichedLoading, setEnrichedLoading] = useState(false);

  // Enriched data fetch
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
  const statusStyle = STATUS_STYLE[request.status] ?? STATUS_STYLE.draft;

  return (
    <aside
      className="flex flex-col shrink-0 overflow-y-auto bg-card border-l sticky top-0 z-10"
      style={{
        width: DOCK_WIDTH,
        height: "100vh",
        animation: "dockSlideIn 200ms ease-out",
      }}
    >
      {/* Realtime subscription */}
      <RealtimeRequest requestId={request.id} />

      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b">
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            #{request.id.slice(0, 6).toUpperCase()}
          </p>
          <h2 className="text-[15px] font-semibold leading-snug text-foreground">
            {request.title}
          </h2>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span
              className="rounded font-mono text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5"
              style={{ background: statusStyle.bg, color: statusStyle.color }}
            >
              {request.status.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground/60">
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
          <Button variant="ghost" size="icon-sm" onClick={close}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 px-5 py-5">

        {/* Tab switcher */}
        <Tabs defaultValue="details" className="-mb-1">
          <TabsList variant="line" className="w-full justify-start border-b">
            <TabsTrigger value="details">
              Details
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <Activity className="size-3" />
              Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <ActivityTimeline requestId={request.id} />
          </TabsContent>

          <TabsContent value="details" className="mt-4 flex flex-col gap-5">
            {/* Project badge */}
            {enriched?.project && (
              <ProjectBadge name={enriched.project.name} color={enriched.project.color} />
            )}

            {/* Phase panel */}
            {request.phase === "predesign" && (
              <>
                <Separator />
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
              </>
            )}
            {request.phase === "design" && (
              <>
                <Separator />
                <DesignPhasePanel
                  requestId={request.id}
                  currentDesignStage={(request.designStage ?? "sense") as "sense" | "frame" | "diverge" | "converge" | "prove"}
                  figmaUrl={request.figmaUrl}
                  profileRole={profileRole}
                  isTestUser={isTestUser}
                />
              </>
            )}
            {request.phase === "dev" && (
              <>
                <Separator />
                <DevPhasePanel
                  requestId={request.id}
                  kanbanState={(request.kanbanState ?? "todo") as "todo" | "in_progress" | "in_review" | "qa" | "done"}
                  figmaUrl={request.figmaUrl}
                  figmaLockedAt={toISOorNull(request.figmaLockedAt)}
                  devQuestionCount={enriched?.comments.filter((c) => c.isDevQuestion).length ?? 0}
                />
              </>
            )}
            {request.phase === "track" && (
              <>
                <Separator />
                <TrackPhasePanel
                  requestId={request.id}
                  trackStage={(request.trackStage ?? "measuring") as "measuring" | "complete"}
                  impactMetric={request.impactMetric}
                  impactPrediction={request.impactPrediction}
                  impactActual={request.impactActual}
                  initialVariancePercent={null}
                />
              </>
            )}
            {request.phase === "track" && enriched && (
              <>
                <Separator />
                <ImpactRetrospectivePanel
                  requestId={request.id}
                  existingRetrospective={enriched.existingRetrospective}
                />
              </>
            )}

            {/* Handoff checklist */}
            <Separator />
            <HandoffChecklist requestId={request.id} stage={request.stage} />

            {/* Description / Context */}
            {request.description && (
              <>
                <Separator />
                <div>
                  <FieldLabel>Problem</FieldLabel>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {request.description}
                  </p>
                </div>
              </>
            )}
            {request.businessContext && (
              <div>
                <FieldLabel>Business context</FieldLabel>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {request.businessContext}
                </p>
              </div>
            )}
            {request.successMetrics && (
              <div>
                <FieldLabel>Success metrics</FieldLabel>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {request.successMetrics}
                </p>
              </div>
            )}

            {/* Figma link + history */}
            {request.figmaUrl && (
              <>
                <Separator />
                <div>
                  <FieldLabel>Figma</FieldLabel>
                  <a href={request.figmaUrl} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline">
                    Open in Figma ↗
                  </a>
                </div>
              </>
            )}
            {request.figmaUrl && (request.phase === "design" || request.phase === "dev" || request.phase === "track") && (
              <>
                <Separator />
                <FigmaHistory requestId={request.id} phase={request.phase as string} />
              </>
            )}

            {/* AI Context Brief (design phase) */}
            {request.phase === "design" && (
              <>
                <Separator />
                <ContextBriefPanel
                  requestId={request.id}
                  existingBrief={enriched?.existingBrief ?? null}
                />
              </>
            )}

            {/* AI Triage */}
            {enriched?.aiAnalysis && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <FieldLabel>AI Triage</FieldLabel>
                    <span className="font-mono text-[9px] text-muted-foreground/60">
                      {enriched.aiAnalysis.aiModel}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {enriched.aiAnalysis.summary}
                    </p>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <FieldLabel>Request quality</FieldLabel>
                        <span
                          className="font-mono text-[11px] font-semibold"
                          style={{
                            color: enriched.aiAnalysis.qualityScore >= 70 ? "var(--accent-success)" : enriched.aiAnalysis.qualityScore >= 40 ? "var(--accent-warning)" : "var(--accent-danger)",
                          }}
                        >
                          {enriched.aiAnalysis.qualityScore}/100
                        </span>
                      </div>
                      <Progress
                        value={enriched.aiAnalysis.qualityScore}
                        className="h-1"
                      />
                    </div>
                    {enriched.aiAnalysis.qualityFlags.length > 0 && (
                      <div>
                        <FieldLabel>Issues</FieldLabel>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {enriched.aiAnalysis.qualityFlags.map((flag, i) => (
                            <Badge key={i} variant="outline" className="text-[11px] text-[var(--accent-warning)] border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/10">
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <FieldLabel>Reasoning</FieldLabel>
                      <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                        {enriched.aiAnalysis.reasoning}
                      </p>
                    </div>
                    {enriched.aiAnalysis.suggestions.length > 0 && (
                      <div>
                        <FieldLabel>Suggestions</FieldLabel>
                        <ul className="space-y-1 mt-1.5">
                          {enriched.aiAnalysis.suggestions.map((s, i) => (
                            <li key={i} className="text-xs leading-relaxed text-muted-foreground">· {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {enriched.aiAnalysis.potentialDuplicates.length > 0 && (
                      <div>
                        <FieldLabel>Potential duplicates</FieldLabel>
                        <div className="space-y-1.5 mt-1.5">
                          {enriched.aiAnalysis.potentialDuplicates.map((dup, i) => (
                            <Link key={i} href={`/dashboard/requests/${dup.id}`}
                              className="block text-xs p-2 rounded-md border hover:bg-muted transition-colors no-underline">
                              <span className="font-medium text-foreground">{dup.title}</span>
                              <span className="ml-1.5 text-muted-foreground/60">{dup.reason}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {enriched && !enriched.aiAnalysis && (
              <>
                <Separator />
                <TriageButton requestId={request.id} />
              </>
            )}

            {/* Assignees */}
            <Separator />
            <div>
              <FieldLabel>Assignees</FieldLabel>
              <div className="mt-2.5">
                <AssignPanel requestId={request.id} />
              </div>
            </div>

            {/* Meta grid */}
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Priority</FieldLabel>
                <p className="text-xs font-medium text-muted-foreground">{request.priority ? PRIORITY_LABELS[request.priority] : "—"}</p>
              </div>
              <div>
                <FieldLabel>Type</FieldLabel>
                <p className="text-xs font-medium text-muted-foreground">{request.requestType ?? "—"}</p>
              </div>
              <div>
                <FieldLabel>Due</FieldLabel>
                <p className="text-xs font-medium text-muted-foreground">{formatDate(request.deadlineAt ?? null)}</p>
              </div>
              <div>
                <FieldLabel>Created</FieldLabel>
                <p className="text-xs font-medium text-muted-foreground">{formatDate(request.createdAt)}</p>
              </div>
              {request.complexity && (
                <div>
                  <FieldLabel>Complexity</FieldLabel>
                  <p className="text-xs font-medium text-muted-foreground">{request.complexity} / 5</p>
                </div>
              )}
              {request.impactPrediction && (
                <div>
                  <FieldLabel>Predicted impact</FieldLabel>
                  <p className="text-xs font-medium text-muted-foreground">{request.impactPrediction}</p>
                </div>
              )}
              {enriched?.requesterName && (
                <div className="col-span-2">
                  <FieldLabel>Submitted by</FieldLabel>
                  <p className="text-xs font-medium text-muted-foreground">{enriched.requesterName}</p>
                </div>
              )}
            </div>

            {/* Stage history */}
            {enriched && enriched.stageHistory.length > 0 && (
              <>
                <Separator />
                <div>
                  <FieldLabel>History</FieldLabel>
                  <div className="space-y-1.5 mt-2">
                    {enriched.stageHistory.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground capitalize">{s.stage}</span>
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {new Date(s.completedAt ?? s.enteredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Activity / Comments */}
            <Separator />
            <div>
              <FieldLabel>
                Activity{enriched ? ` (${enriched.comments.length})` : ""}
              </FieldLabel>
              {enrichedLoading && (
                <p className="text-xs text-muted-foreground/60 mt-2">Loading...</p>
              )}
              {enriched && enriched.comments.length === 0 && (
                <p className="text-xs text-muted-foreground/60 mt-2 mb-3">No comments yet</p>
              )}
              {enriched && enriched.comments.length > 0 && (
                <div className="space-y-3 mt-2.5 mb-4">
                  {enriched.comments.map((c) => {
                    const author = c.authorId ? enriched.authorMap[c.authorId] : null;
                    return (
                      <div key={c.id} className="border rounded-md p-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          {c.isSystem ? (
                            <Badge variant="secondary" className="font-mono text-[9px] tracking-wider uppercase h-4">
                              system
                            </Badge>
                          ) : (
                            <span className="text-xs font-medium text-foreground">
                              {author?.fullName ?? "Unknown"}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-muted-foreground/60">
                            {c.createdAt ? formatDateTime(new Date(c.createdAt).toISOString()) : ""}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">{c.body}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <CommentBox requestId={request.id} />
            </div>
          </TabsContent>
        </Tabs>

        {/* Open full page */}
        <Separator />
        <div className="text-center pb-2">
          <Link href={`/dashboard/requests/${request.id}`} className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors no-underline">
            Open full page →
          </Link>
        </div>
      </div>
    </aside>
  );
}
