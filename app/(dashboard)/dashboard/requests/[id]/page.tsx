import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, comments, requestStages, requestAiAnalysis, requestContextBriefs, projects, figmaConnections } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { AssignPanel } from "@/components/requests/assign-panel";
import { StageControls } from "@/components/requests/stage-controls";
import { CommentBox } from "@/components/requests/comment-box";
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
import { requestHandoffBriefs, predictionConfidence as predictionConfidenceTable, impactRetrospectives, impactRecords } from "@/db/schema";
import { syncFigmaVersions } from "@/lib/figma/sync";
import { decryptToken } from "@/lib/encrypt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const priorityConfig: Record<string, { label: string; variant: "destructive" | "outline" | "secondary" | "default"; desc: string }> = {
  p0: { label: "P0", variant: "destructive", desc: "Critical -- blocking" },
  p1: { label: "P1", variant: "default", desc: "High -- this week" },
  p2: { label: "P2", variant: "secondary", desc: "Medium -- this sprint" },
  p3: { label: "P3", variant: "outline", desc: "Low -- backlog" },
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

  // Fetch impact record for variance display in track phase
  let initialVariancePercent: number | null = null;
  if (request.phase === "track") {
    try {
      const [impactRecord] = await db.select().from(impactRecords).where(eq(impactRecords.requestId, id));
      initialVariancePercent = impactRecord?.variancePercent
        ? parseFloat(impactRecord.variancePercent as string)
        : null;
    } catch {
      // impact record query failed silently
    }
  }

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
      figmaAccessToken = decryptToken(conn.accessToken);
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

  let project: (typeof projects.$inferSelect) | null = null;
  try {
    project = request.projectId
      ? await db.select().from(projects).where(eq(projects.id, request.projectId)).then(([p]) => p ?? null)
      : null;
  } catch {
    // project query failed silently
  }

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

  let existingConfidence: (typeof predictionConfidenceTable.$inferSelect) | null = null;
  try {
    const [confRow] = await db
      .select()
      .from(predictionConfidenceTable)
      .where(eq(predictionConfidenceTable.requestId, id));
    existingConfidence = confRow ?? null;
  } catch {
    // confidence query failed silently
  }

  let existingRetrospective: (typeof impactRetrospectives.$inferSelect) | null = null;
  try {
    const [retroRow] = await db
      .select()
      .from(impactRetrospectives)
      .where(eq(impactRetrospectives.requestId, id));
    existingRetrospective = retroRow ?? null;
  } catch {
    // retrospective query failed silently
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

  const qualityScore = aiAnalysis?.qualityScore ?? 0;
  const qualityColor =
    qualityScore >= 70
      ? "text-green-400"
      : qualityScore >= 40
      ? "text-yellow-400"
      : "text-red-400";
  const qualityBarColor =
    qualityScore >= 70
      ? "bg-green-500"
      : qualityScore >= 40
      ? "bg-yellow-500"
      : "bg-red-500";

  return (
    <>
      {/* Real-time subscription -- invisible, triggers router.refresh() on any change */}
      <RealtimeRequest requestId={request.id} />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title + meta */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                {request.priority && (
                  <Badge
                    variant={priorityConfig[request.priority]?.variant ?? "outline"}
                    className="font-mono text-[10px]"
                  >
                    {request.priority.toUpperCase()}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {statusLabels[request.status] ?? request.status}
                </Badge>
                {request.requestType && (
                  <span className="text-xs text-muted-foreground/60 capitalize">
                    {request.requestType}
                  </span>
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
              <p className="text-sm text-muted-foreground">
                Submitted by {requesterName} · {formatDate(toISO(request.createdAt)!)}
              </p>
              {project && (
                <ProjectBadge name={project.name} color={project.color} className="mt-2" />
              )}
            </div>

            {/* Description */}
            <section>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Description</h2>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{request.description}</p>
            </section>

            {request.businessContext && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Business Context</h2>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{request.businessContext}</p>
              </section>
            )}

            {request.successMetrics && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Success Metrics</h2>
                <p className="text-sm text-foreground leading-relaxed">{request.successMetrics}</p>
              </section>
            )}

            {/* AI Context Brief -- design phase only */}
            {request.phase === "design" && (
              <ContextBriefPanel
                requestId={request.id}
                existingBrief={existingBrief}
              />
            )}

            {/* AI Handoff Brief -- shown at Handoff stage and throughout dev phase */}
            {request.phase === "dev" && (
              <HandoffBriefPanel
                requestId={request.id}
                existingBrief={existingHandoffBrief}
              />
            )}

            {request.figmaUrl && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Figma</h2>
                <Button variant="link" className="p-0 h-auto text-sm" render={<a href={request.figmaUrl} target="_blank" rel="noopener noreferrer" />}>
                  Open in Figma
                </Button>
              </section>
            )}

            {/* Figma update history -- visible from design phase onwards */}
            {(request.phase === "design" || request.phase === "dev" || request.phase === "track") && (
              <FigmaHistory requestId={request.id} phase={request.phase as string} isConnected={isConnected} figmaUrl={request.figmaUrl} />
            )}

            <HandoffChecklist requestId={request.id} stage={request.stage} />

            {/* AI Triage */}
            {aiAnalysis ? (
              <Card>
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      AI Triage
                    </CardTitle>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">{aiAnalysis.aiModel}</span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  {/* Summary */}
                  <p className="text-sm text-foreground leading-relaxed">{aiAnalysis.summary}</p>

                  {/* Quality score */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Request quality</span>
                      <span className={`text-xs font-mono ${qualityColor}`}>
                        {aiAnalysis.qualityScore}/100
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-accent rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${qualityBarColor}`}
                        /* percentage-based width needs inline style for dynamic value */
                        style={{ width: `${aiAnalysis.qualityScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Quality flags */}
                  {aiAnalysis.qualityFlags.length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">Issues</div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiAnalysis.qualityFlags.map((flag, i) => (
                          <Badge key={i} variant="outline" className="text-[11px] text-yellow-400/80 bg-yellow-500/10 border-yellow-500/20">
                            {flag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div>
                    <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1.5">Reasoning</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{aiAnalysis.reasoning}</p>
                  </div>

                  {/* Suggestions */}
                  {aiAnalysis.suggestions.length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">Suggestions</div>
                      <ul className="space-y-1.5">
                        {aiAnalysis.suggestions.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-2">
                            <span className="text-primary shrink-0">-</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Potential duplicates */}
                  {aiAnalysis.potentialDuplicates.length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">Potential duplicates</div>
                      <div className="space-y-1.5">
                        {aiAnalysis.potentialDuplicates.map((dup, i) => (
                          <Card key={i} size="sm" className="hover:ring-foreground/20 transition-all">
                            <CardContent className="px-3 py-2">
                              <Link
                                href={`/dashboard/requests/${dup.id}`}
                                className="block text-xs"
                              >
                                <span className="text-foreground">{dup.title}</span>
                                <span className="text-muted-foreground/60 ml-2">{dup.reason}</span>
                              </Link>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <TriageButton requestId={request.id} />
            )}

            {/* Comments */}
            <section>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Activity ({requestComments.length})
              </h2>
              {requestComments.length === 0 ? (
                <p className="text-sm text-muted-foreground/60">No comments yet</p>
              ) : (
                <div className="space-y-3">
                  {requestComments.map((c) => {
                    const author = c.authorId ? authorMap[c.authorId] : null;
                    return (
                      <Card key={c.id} size="sm">
                        <CardContent className="px-4 py-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            {c.isSystem ? (
                              <Badge variant="secondary" className="text-[10px]">system</Badge>
                            ) : (
                              <span className="text-xs font-medium text-foreground">{author?.fullName ?? "Unknown"}</span>
                            )}
                            <span className="text-xs text-muted-foreground/60">
                              {c.createdAt ? formatDate(new Date(c.createdAt).toISOString()) : ""}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
                        </CardContent>
                      </Card>
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
                  impactMetric={request.impactMetric}
                  impactPrediction={request.impactPrediction}
                  existingConfidence={existingConfidence}
                />
              </div>
            ) : request.phase === "design" ? (
              <div className="mb-2">
                <DesignPhasePanel
                  requestId={request.id}
                  currentDesignStage={(request.designStage ?? "sense") as "sense" | "frame" | "diverge" | "converge" | "prove"}
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
                  initialVariancePercent={initialVariancePercent}
                />
              </div>
            ) : (
              <div className="border-b pb-4">
                <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">Stage</div>
                <StageControls
                  requestId={request.id}
                  currentStage={request.stage}
                  currentStatus={request.status}
                  updatedAt={request.updatedAt.toISOString()}
                />
              </div>
            )}

            {stageHistory.length > 0 && (
              <>
                <Separator />
                <div className="pb-1">
                  <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">History</div>
                  <div className="space-y-1.5">
                    {stageHistory.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground/60 capitalize">{s.stage}</span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {new Date(s.completedAt ?? s.enteredAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <SidebarField label="Status">
              <Badge variant="outline" className="capitalize">
                {request.status.replace(/_/g, " ")}
              </Badge>
            </SidebarField>

            {request.priority && (
              <SidebarField label="Priority">
                <div className="flex items-center gap-1.5">
                  <Badge variant={priorityConfig[request.priority]?.variant ?? "outline"} className="font-mono text-[10px]">
                    {request.priority.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground/60">{priorityConfig[request.priority]?.desc}</span>
                </div>
              </SidebarField>
            )}

            {request.complexity && (
              <SidebarField label="Complexity">
                <span className="text-sm font-mono">
                  {"▪".repeat(request.complexity)}
                  {"▫".repeat(5 - request.complexity)}
                  <span className="text-muted-foreground ml-1">{request.complexity}/5</span>
                </span>
              </SidebarField>
            )}

            {request.deadlineAt && (
              <SidebarField label="Deadline">
                <span className="text-sm">{formatDate(toISO(request.deadlineAt)!)}</span>
              </SidebarField>
            )}

            <Separator />
            <div className="pb-1">
              <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-2">Assignees</div>
              <AssignPanel requestId={request.id} />
            </div>

            <SidebarField label="Requester">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {requesterName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{requesterName}</span>
                <span className="text-xs text-muted-foreground/60 capitalize">({requesterRole})</span>
              </div>
            </SidebarField>

            <SidebarField label="Created">
              <span className="text-sm text-muted-foreground">{formatDate(toISO(request.createdAt)!)}</span>
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
    <>
      <Separator />
      <div className="pb-1">
        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1.5">{label}</div>
        <div className="text-foreground">{children}</div>
      </div>
    </>
  );
}
