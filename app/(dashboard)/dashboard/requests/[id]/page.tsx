import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, comments, requestStages, requestAiAnalysis } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { AssignPanel } from "@/components/requests/assign-panel";
import { StageControls } from "@/components/requests/stage-controls";
import { CommentBox } from "@/components/requests/comment-box";
import { ImpactPanel } from "@/components/requests/impact-panel";
import { EditRequestButton } from "@/components/requests/edit-request-button";
import { HandoffChecklist } from "@/components/requests/handoff-checklist";
import { TriageButton } from "@/components/requests/triage-button";
import { PredesignPanel } from "@/components/requests/predesign-panel";

const priorityConfig: Record<string, { label: string; color: string; desc: string }> = {
  p0: { label: "P0", color: "bg-red-500/15 text-red-400 border-red-500/20", desc: "Critical — blocking" },
  p1: { label: "P1", color: "bg-orange-500/15 text-orange-400 border-orange-500/20", desc: "High — this week" },
  p2: { label: "P2", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", desc: "Medium — this sprint" },
  p3: { label: "P3", color: "bg-zinc-700/50 text-zinc-400 border-zinc-700", desc: "Low — backlog" },
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">DesignQ</span>
            <span className="text-zinc-700">·</span>
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Requests
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-sm text-zinc-300 truncate max-w-xs">{request.title}</span>
          </div>
          <Link href="/dashboard/team" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Team
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
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
                <span className="text-xs text-zinc-500">{statusLabels[request.status] ?? request.status}</span>
                {request.requestType && (
                  <span className="text-xs text-zinc-600 capitalize">· {request.requestType}</span>
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
              <p className="text-sm text-zinc-500">
                Submitted by {requesterName} · {formatDate(toISO(request.createdAt)!)}
              </p>
            </div>

            {/* Description */}
            <section>
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Description</h2>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{request.description}</p>
            </section>

            {request.businessContext && (
              <section>
                <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Business Context</h2>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{request.businessContext}</p>
              </section>
            )}

            {request.successMetrics && (
              <section>
                <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Success Metrics</h2>
                <p className="text-sm text-zinc-300 leading-relaxed">{request.successMetrics}</p>
              </section>
            )}

            {request.figmaUrl && (
              <section>
                <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Figma</h2>
                <a href={request.figmaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                  Open in Figma
                </a>
              </section>
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
              <section className="border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">AI Triage</span>
                  <span className="text-[10px] text-zinc-600 font-mono">{aiAnalysis.aiModel}</span>
                </div>

                <div className="p-5 space-y-5">
                  {/* Summary */}
                  <p className="text-sm text-zinc-300 leading-relaxed">{aiAnalysis.summary}</p>

                  {/* Quality score */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wide">Request quality</span>
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
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
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
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Issues</div>
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
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">Reasoning</div>
                    <p className="text-xs text-zinc-500 leading-relaxed">{aiAnalysis.reasoning}</p>
                  </div>

                  {/* Suggestions */}
                  {aiAnalysis.suggestions.length > 0 && (
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Suggestions</div>
                      <ul className="space-y-1.5">
                        {aiAnalysis.suggestions.map((s, i) => (
                          <li key={i} className="text-xs text-zinc-400 flex gap-2">
                            <span className="text-indigo-400 shrink-0">-</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Potential duplicates */}
                  {aiAnalysis.potentialDuplicates.length > 0 && (
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Potential duplicates</div>
                      <div className="space-y-1.5">
                        {aiAnalysis.potentialDuplicates.map((dup, i) => (
                          <Link
                            key={i}
                            href={`/dashboard/requests/${dup.id}`}
                            className="block text-xs border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700 transition-colors"
                          >
                            <span className="text-zinc-300">{dup.title}</span>
                            <span className="text-zinc-600 ml-2">{dup.reason}</span>
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
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
                Activity ({requestComments.length})
              </h2>
              {requestComments.length === 0 ? (
                <p className="text-sm text-zinc-700">No comments yet</p>
              ) : (
                <div className="space-y-3">
                  {requestComments.map((c) => {
                    const author = c.authorId ? authorMap[c.authorId] : null;
                    return (
                      <div key={c.id} className="border border-zinc-800 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {c.isSystem ? (
                            <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">system</span>
                          ) : (
                            <span className="text-xs font-medium text-zinc-300">{author?.fullName ?? "Unknown"}</span>
                          )}
                          <span className="text-xs text-zinc-600">
                            {c.createdAt ? formatDate(new Date(c.createdAt).toISOString()) : ""}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed">{c.body}</p>
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
            ) : (
              <div className="border-b border-zinc-800/50 pb-4">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Stage</div>
                <StageControls
                  requestId={request.id}
                  currentStage={request.stage}
                  currentStatus={request.status}
                  updatedAt={request.updatedAt.toISOString()}
                />
              </div>
            )}

            {stageHistory.length > 0 && (
              <div className="border-b border-zinc-800/50 pb-4">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">History</div>
                <div className="space-y-1.5">
                  {stageHistory.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-600 capitalize">{s.stage}</span>
                      <span className="text-[10px] text-zinc-700">
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
                <span className="text-xs text-zinc-600 ml-1.5">{priorityConfig[request.priority]?.desc}</span>
              </SidebarField>
            )}

            {request.complexity && (
              <SidebarField label="Complexity">
                <span className="text-sm font-mono">
                  {"▪".repeat(request.complexity)}
                  {"▫".repeat(5 - request.complexity)}
                  <span className="text-zinc-500 ml-1">{request.complexity}/5</span>
                </span>
              </SidebarField>
            )}

            {request.deadlineAt && (
              <SidebarField label="Deadline">
                <span className="text-sm">{formatDate(toISO(request.deadlineAt)!)}</span>
              </SidebarField>
            )}

            <div className="border-b border-zinc-800/50 pb-4">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Assignees</div>
              <AssignPanel requestId={request.id} />
            </div>

            <SidebarField label="Requester">
              <span className="text-sm">{requesterName}</span>
              <span className="text-xs text-zinc-600 capitalize ml-1">({requesterRole})</span>
            </SidebarField>

            <SidebarField label="Created">
              <span className="text-sm text-zinc-400">{formatDate(toISO(request.createdAt)!)}</span>
            </SidebarField>
          </div>
        </div>
      </main>
    </div>
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
    <div className="border-b border-zinc-800/50 pb-4">
      <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">{label}</div>
      <div className="text-zinc-300">{children}</div>
    </div>
  );
}
