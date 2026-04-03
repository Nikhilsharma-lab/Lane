import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, comments, requestStages, requestAiAnalysis, requestContextBriefs, projects, figmaConnections } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { AssignPanel } from "@/components/requests/assign-panel";
import { StageControls } from "@/components/requests/stage-controls";
import { CommentBox } from "@/components/requests/comment-box";
import { ImpactPanel } from "@/components/requests/impact-panel";
import { EditRequestButton } from "@/components/requests/edit-request-button";
import { HandoffChecklist } from "@/components/requests/handoff-checklist";
import { TriageButton } from "@/components/requests/triage-button";
import { PredesignPanel } from "@/components/requests/predesign-panel";
import { DesignPhasePanel } from "@/components/requests/design-phase-panel";
import { DevPhasePanel } from "@/components/requests/dev-phase-panel";
import { TrackPhasePanel } from "@/components/requests/track-phase-panel";
import { FigmaHistory } from "@/components/requests/figma-history";
import { RealtimeRequest } from "@/components/realtime/realtime-request";
import { ProjectBadge } from "@/components/projects/project-badge";
import { ContextBriefPanel } from "@/components/requests/context-brief-panel";
import { HandoffBriefPanel } from "@/components/requests/handoff-brief-panel";
import { requestHandoffBriefs } from "@/db/schema";
import { syncFigmaVersions } from "@/lib/figma/sync";

const priorityConfig: Record<string, { label: string; color: string; desc: string }> = {
  p0: { label: "P0", color: "bg-red-500/15 text-red-400 border-red-500/20", desc: "Critical — blocking" },
  p1: { label: "P1", color: "bg-orange-500/15 text-orange-400 border-orange-500/20", desc: "High — this week" },
  p2: { label: "P2", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", desc: "Medium — this sprint" },
  p3: { label: "P3", color: "bg-[var(--bg-hover)] text-[var(--text-tertiary)] border-[var(--border)]", desc: "Low — backlog" },
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  triaged: "Triaged",
  assigned: "Assigned",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  completed: "Completed",
  shipped: "Shipped",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toISO(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  /* ---- auth ---- */
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const [request] = await db.select().from(requests).where(eq(requests.id, id));
  if (!request || request.orgId !== profile.orgId) notFound();

  // Figma connection check
  let isConnected = false;
  let figmaAccessToken: string | null = null;
  try {
    const [conn] = await db
      .select()
      .from(figmaConnections)
      .where(eq(figmaConnections.orgId, profile.orgId));
    if (conn) {
      isConnected = true;
      figmaAccessToken = conn.accessToken;
    }
  } catch {
    // silent
  }

  // On-demand Figma sync
  if (
    isConnected &&
    figmaAccessToken &&
    request.figmaUrl &&
    (request.phase === "design" || request.phase === "dev" || request.phase === "track")
  ) {
    const requestPhase =
      request.phase === "design" ? "design"
      : request.phase === "dev" ? "dev"
      : null;
    const postHandoff =
      request.phase === "dev" ||
      request.phase === "track" ||
      !!request.figmaLockedAt;

    try {
      await syncFigmaVersions({
        requestId: request.id,
        figmaUrl: request.figmaUrl,
        accessToken: figmaAccessToken,
        requestPhase: requestPhase as "design" | "dev" | null,
        postHandoff,
      });
    } catch {
      // silent — page always loads
    }
  }

  const project = request.projectId
    ? await db.select().from(projects).where(eq(projects.id, request.projectId)).then(([p]) => p ?? null)
    : null;

  /* ---- secondary queries (each wrapped) ---- */
  let requesterName = "Unknown";
  let requesterRole = "";
  try {
    const [requester] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, request.requesterId));
    if (requester) {
      requesterName = requester.fullName ?? "Unknown";
      requesterRole = requester.role ?? "";
    }
  } catch (e: unknown) {
    // requester query failed silently
  }

  let stageHistory: (typeof requestStages.$inferSelect)[] = [];
  try {
    stageHistory = await db
      .select()
      .from(requestStages)
      .where(eq(requestStages.requestId, id))
      .orderBy(requestStages.completedAt);
  } catch (e: unknown) {
    // stageHistory query failed silently
  }

  let requestComments: (typeof comments.$inferSelect)[] = [];
  let authorMap: Record<string, { fullName: string | null }> = {};
  try {
    requestComments = await db
      .select()
      .from(comments)
      .where(eq(comments.requestId, id))
      .orderBy(comments.createdAt);

    const authorIds = [
      ...new Set(requestComments.map((c) => c.authorId).filter(Boolean)),
    ] as string[];
    if (authorIds.length) {
      const authorProfiles = await db
        .select()
        .from(profiles)
        .where(inArray(profiles.id, authorIds));
      authorMap = Object.fromEntries(
        authorProfiles.map((p) => [p.id, { fullName: p.fullName }])
      );
    }
  } catch (e: unknown) {
    // comments query failed silently
  }

  let aiAnalysis: (typeof requestAiAnalysis.$inferSelect) | null = null;
  try {
    const [row] = await db
      .select()
      .from(requestAiAnalysis)
      .where(eq(requestAiAnalysis.requestId, id));
    aiAnalysis = row ?? null;
  } catch {
    // ai analysis query failed silently
  }

  let existingBrief: (typeof requestContextBriefs.$inferSelect) | null = null;
  try {
    const [briefRow] = await db
      .select()
      .from(requestContextBriefs)
      .where(eq(requestContextBriefs.requestId, id));
    existingBrief = briefRow ?? null;
  } catch {
    // brief query failed silently
  }

  let existingHandoffBrief: (typeof requestHandoffBriefs.$inferSelect) | null = null;
  try {
    const [handoffBriefRow] = await db
      .select()
      .from(requestHandoffBriefs)
      .where(eq(requestHandoffBriefs.requestId, id));
    existingHandoffBrief = handoffBriefRow ?? null;
  } catch {
    // handoff brief query failed silently
  }

  /* ---- serialise for client components ---- */
  const sr = JSON.parse(JSON.stringify(request)) as {
    id: string;
    title: string;
    description: string;
    businessContext: string | null;
    successMetrics: string | null;
    figmaUrl: string | null;
    impactMetric: string | null;
    impactPrediction: string | null;
    deadlineAt: string | null;
    [key: string]: unknown;
  };

  const canEdit =
    profile.id === request.requesterId ||
    profile.role === "lead" ||
    profile.role === "admin";

  const isTestUser = profile.email === "hi.nikhilsharma@gmail.com";

  return (
    <>
      {/* Real-time subscription — invisible, triggers router.refresh() on any change */}
      <RealtimeRequest requestId={request.id} />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title + meta */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                {request.priority && (
                  <span className={`text-xs px-2 py-0.5 rounded border font-mono ${priorityConfig[request.priority]?.color}`}>
                    {request.priority.toUpperCase()}
                  </span>
                )}
                <span className="text-xs text-[var(--text-secondary)]">{statusLabels[request.status] ?? request.status}</span>
                {request.requestType && (
                  <span className="text-xs text-[var(--text-tertiary)] capitalize">· {request.requestType}</span>
                )}
              </div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h1 className="text-2xl font-semibold">{request.title}</h1>
                {canEdit && (
                  <div className="shrink-0 mt-1">
                    <EditRequestButton request={sr} />
                  </div>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Submitted by {requesterName} · {formatDate(toISO(request.createdAt)!)}
              </p>
              {project && (
                <ProjectBadge name={project.name} color={project.color} className="mt-2" />
              )}
            </div>

            {/* Description */}
            <section>
              <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">Description</h2>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{request.description}</p>
            </section>

            {request.businessContext && (
              <section>
                <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">Business Context</h2>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{request.businessContext}</p>
              </section>
            )}

            {request.successMetrics && (
              <section>
                <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">Success Metrics</h2>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">{request.successMetrics}</p>
              </section>
            )}

            {/* AI Context Brief — design phase only */}
            {request.phase === "design" && (
              <ContextBriefPanel
                requestId={request.id}
                existingBrief={existingBrief}
              />
            )}

            {/* AI Handoff Brief — shown at Handoff stage and throughout dev phase */}
            {((request.phase === "design" && request.designStage === "handoff") ||
              request.phase === "dev") && (
              <HandoffBriefPanel
                requestId={request.id}
                existingBrief={existingHandoffBrief}
              />
            )}

            {request.figmaUrl && (
              <section>
                <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">Figma</h2>
                <a href={request.figmaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                  Open in Figma
                </a>
              </section>
            )}

            {/* Figma update history — visible from design phase onwards */}
            {(request.phase === "design" || request.phase === "dev" || request.phase === "track") && (
              <FigmaHistory requestId={request.id} phase={request.phase as string} isConnected={isConnected} figmaUrl={request.figmaUrl} />
            )}

            <HandoffChecklist requestId={request.id} stage={request.stage} />

            <ImpactPanel
              requestId={request.id}
              impactMetric={request.impactMetric}
              impactPrediction={request.impactPrediction}
              impactActual={request.impactActual}
              impactLoggedAt={toISO(request.impactLoggedAt)}
              stage={request.stage}
            />

            {/* AI Triage */}
            {aiAnalysis ? (
              <section className="border border-[var(--border)] rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">AI Triage</span>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{aiAnalysis.aiModel}</span>
                </div>

                <div className="p-5 space-y-5">
                  {/* Summary */}
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed">{aiAnalysis.summary}</p>

                  {/* Quality score */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">Request quality</span>
                      <span className={`text-xs font-mono ${
                        aiAnalysis.qualityScore >= 70
                          ? "text-green-400"
                          : aiAnalysis.qualityScore >= 40
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}>
                        {aiAnalysis.qualityScore}/100
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          aiAnalysis.qualityScore >= 70
                            ? "bg-green-500"
                            : aiAnalysis.qualityScore >= 40
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${aiAnalysis.qualityScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Quality flags */}
                  {aiAnalysis.qualityFlags.length > 0 && (
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Issues</div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiAnalysis.qualityFlags.map((flag, i) => (
                          <span key={i} className="text-[11px] text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-0.5">
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div>
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">Reasoning</div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{aiAnalysis.reasoning}</p>
                  </div>

                  {/* Suggestions */}
                  {aiAnalysis.suggestions.length > 0 && (
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Suggestions</div>
                      <ul className="space-y-1.5">
                        {aiAnalysis.suggestions.map((s, i) => (
                          <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                            <span className="text-[var(--accent)] shrink-0">-</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Potential duplicates */}
                  {aiAnalysis.potentialDuplicates.length > 0 && (
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Potential duplicates</div>
                      <div className="space-y-1.5">
                        {aiAnalysis.potentialDuplicates.map((dup, i) => (
                          <Link
                            key={i}
                            href={`/dashboard/requests/${dup.id}`}
                            className="block text-xs border border-[var(--border)] rounded-lg px-3 py-2 hover:border-[var(--border-strong)] transition-colors"
                          >
                            <span className="text-[var(--text-primary)]">{dup.title}</span>
                            <span className="text-[var(--text-tertiary)] ml-2">{dup.reason}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <TriageButton requestId={request.id} />
            )}

            {/* Comments */}
            <section>
              <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-3">
                Activity ({requestComments.length})
              </h2>
              {requestComments.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">No comments yet</p>
              ) : (
                <div className="space-y-3">
                  {requestComments.map((c) => {
                    const author = c.authorId ? authorMap[c.authorId] : null;
                    return (
                      <div key={c.id} className="border border-[var(--border)] rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {c.isSystem ? (
                            <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-hover)] rounded px-1.5 py-0.5">system</span>
                          ) : (
                            <span className="text-xs font-medium text-[var(--text-primary)]">{author?.fullName ?? "Unknown"}</span>
                          )}
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {c.createdAt ? formatDate(new Date(c.createdAt).toISOString()) : ""}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{c.body}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <CommentBox requestId={request.id} />
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {request.phase === "predesign" ? (
              <div className="mb-2">
                <PredesignPanel
                  requestId={request.id}
                  currentStage={(request.predesignStage ?? request.stage) as "intake" | "context" | "shape" | "bet"}
                  description={request.description}
                  businessContext={request.businessContext}
                  successMetrics={request.successMetrics}
                  profileRole={profile.role ?? "member"}
                />
              </div>
            ) : request.phase === "design" ? (
              <div className="mb-2">
                <DesignPhasePanel
                  requestId={request.id}
                  currentDesignStage={(request.designStage ?? "explore") as "explore" | "validate" | "handoff"}
                  figmaUrl={request.figmaUrl}
                  profileRole={profile.role ?? "member"}
                  isTestUser={isTestUser}
                />
              </div>
            ) : request.phase === "dev" ? (
              <div className="mb-2">
                <DevPhasePanel
                  requestId={request.id}
                  kanbanState={(request.kanbanState ?? "todo") as "todo" | "in_progress" | "in_review" | "qa" | "done"}
                  figmaUrl={request.figmaUrl}
                  figmaLockedAt={toISO(request.figmaLockedAt)}
                  devQuestionCount={requestComments.filter((c) => c.isDevQuestion).length}
                />
              </div>
            ) : request.phase === "track" ? (
              <div className="mb-2">
                <TrackPhasePanel
                  requestId={request.id}
                  trackStage={(request.trackStage ?? "measuring") as "measuring" | "complete"}
                  impactMetric={request.impactMetric}
                  impactPrediction={request.impactPrediction}
                  impactActual={request.impactActual}
                />
              </div>
            ) : (
              <div className="border-b border-[var(--border)] pb-4">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Stage</div>
                <StageControls
                  requestId={request.id}
                  currentStage={request.stage}
                  currentStatus={request.status}
                  updatedAt={request.updatedAt.toISOString()}
                />
              </div>
            )}

            {stageHistory.length > 0 && (
              <div className="border-b border-[var(--border)] pb-4">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">History</div>
                <div className="space-y-1.5">
                  {stageHistory.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--text-tertiary)] capitalize">{s.stage}</span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {new Date(s.completedAt ?? s.enteredAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <SidebarField label="Status">
              <span className="text-sm capitalize">{request.status.replace(/_/g, " ")}</span>
            </SidebarField>

            {request.priority && (
              <SidebarField label="Priority">
                <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${priorityConfig[request.priority]?.color}`}>
                  {request.priority.toUpperCase()}
                </span>
                <span className="text-xs text-[var(--text-tertiary)] ml-1.5">{priorityConfig[request.priority]?.desc}</span>
              </SidebarField>
            )}

            {request.complexity && (
              <SidebarField label="Complexity">
                <span className="text-sm font-mono">
                  {"▪".repeat(request.complexity)}
                  {"▫".repeat(5 - request.complexity)}
                  <span className="text-[var(--text-secondary)] ml-1">{request.complexity}/5</span>
                </span>
              </SidebarField>
            )}

            {request.deadlineAt && (
              <SidebarField label="Deadline">
                <span className="text-sm">{formatDate(toISO(request.deadlineAt)!)}</span>
              </SidebarField>
            )}

            <div className="border-b border-[var(--border)] pb-4">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Assignees</div>
              <AssignPanel requestId={request.id} />
            </div>

            <SidebarField label="Requester">
              <span className="text-sm">{requesterName}</span>
              <span className="text-xs text-[var(--text-tertiary)] capitalize ml-1">({requesterRole})</span>
            </SidebarField>

            <SidebarField label="Created">
              <span className="text-sm text-[var(--text-secondary)]">{formatDate(toISO(request.createdAt)!)}</span>
            </SidebarField>
          </div>
        </div>
      </div>
    </>
  );
}

function SidebarField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--border)] pb-4">
      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">{label}</div>
      <div className="text-[var(--text-primary)]">{children}</div>
    </div>
  );
}
