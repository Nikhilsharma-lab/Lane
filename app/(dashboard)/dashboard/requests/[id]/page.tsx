import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, requestAiAnalysis, comments } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { AssignPanel } from "@/components/requests/assign-panel";
import { StageControls } from "@/components/requests/stage-controls";
import { CommentBox } from "@/components/requests/comment-box";

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

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const [request] = await db.select().from(requests).where(eq(requests.id, id));
  if (!request || request.orgId !== profile.orgId) notFound();

  const [triage] = await db
    .select()
    .from(requestAiAnalysis)
    .where(eq(requestAiAnalysis.requestId, id));

  const [requester] = await db.select().from(profiles).where(eq(profiles.id, request.requesterId));

  const requestComments = await db
    .select()
    .from(comments)
    .where(eq(comments.requestId, id))
    .orderBy(comments.createdAt);

  // Build a profile lookup for comment authors
  const authorIds = [...new Set(requestComments.map((c) => c.authorId).filter(Boolean))] as string[];
  const authorProfiles = authorIds.length
    ? await db.select().from(profiles).where(inArray(profiles.id, authorIds))
    : [];
  const authorMap = Object.fromEntries(authorProfiles.map((p) => [p.id, p]));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Requests
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-sm text-zinc-300 truncate">{request.title}</span>
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
                <span className="text-xs text-zinc-500">
                  {statusLabels[request.status] ?? request.status}
                </span>
                {request.requestType && (
                  <span className="text-xs text-zinc-600 capitalize">· {request.requestType}</span>
                )}
              </div>
              <h1 className="text-2xl font-semibold mb-2">{request.title}</h1>
              <p className="text-sm text-zinc-500">
                Submitted by {requester?.fullName ?? "Unknown"} · {formatDate(request.createdAt)}
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

            {/* AI Triage */}
            {triage ? (
              <section className="border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">AI Triage</span>
                      <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">
                        {triage.aiModel}
                      </span>
                    </div>
                    <QualityBadge score={triage.qualityScore} />
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* Summary */}
                  <div>
                    <p className="text-sm text-zinc-300">{triage.summary}</p>
                  </div>

                  {/* Scores row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-zinc-900/60 rounded-lg p-3">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Priority</div>
                      <div className={`text-sm font-mono ${priorityConfig[triage.priority]?.color} inline-block px-1.5 py-0.5 rounded border`}>
                        {triage.priority.toUpperCase()}
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1">{priorityConfig[triage.priority]?.desc}</p>
                    </div>
                    <div className="bg-zinc-900/60 rounded-lg p-3">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Complexity</div>
                      <div className="text-sm font-mono text-zinc-300">
                        {"▪".repeat(triage.complexity)}{"▫".repeat(5 - triage.complexity)}
                        <span className="text-zinc-500 ml-1">{triage.complexity}/5</span>
                      </div>
                    </div>
                    <div className="bg-zinc-900/60 rounded-lg p-3">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Type</div>
                      <div className="text-sm text-zinc-300 capitalize">{triage.requestType}</div>
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div>
                    <h3 className="text-xs text-zinc-500 font-medium mb-1.5">Reasoning</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{triage.reasoning}</p>
                  </div>

                  {/* Quality flags */}
                  {(triage.qualityFlags as string[])?.length > 0 && (
                    <div>
                      <h3 className="text-xs text-zinc-500 font-medium mb-1.5">Quality Issues</h3>
                      <ul className="space-y-1">
                        {(triage.qualityFlags as string[]).map((flag, i) => (
                          <li key={i} className="text-sm text-yellow-400/80 flex items-start gap-2">
                            <span className="text-yellow-500/60 mt-0.5">⚠</span>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {(triage.suggestions as string[])?.length > 0 && (
                    <div>
                      <h3 className="text-xs text-zinc-500 font-medium mb-1.5">Suggestions</h3>
                      <ul className="space-y-1">
                        {(triage.suggestions as string[]).map((s, i) => (
                          <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
                            <span className="text-zinc-600">→</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <div className="border border-zinc-800 rounded-xl p-8 text-center">
                <p className="text-sm text-zinc-600">AI triage pending — add ANTHROPIC_API_KEY to enable</p>
              </div>
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
                            <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">AI</span>
                          ) : (
                            <span className="text-xs font-medium text-zinc-300">
                              {author?.fullName ?? "Unknown"}
                            </span>
                          )}
                          <span className="text-xs text-zinc-600">{formatDate(c.createdAt)}</span>
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
            <div className="border-b border-zinc-800/50 pb-4">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Stage</div>
              <StageControls requestId={request.id} currentStage={request.stage} />
            </div>

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
                  {"▪".repeat(request.complexity)}{"▫".repeat(5 - request.complexity)}
                  <span className="text-zinc-500 ml-1">{request.complexity}/5</span>
                </span>
              </SidebarField>
            )}

            {request.deadlineAt && (
              <SidebarField label="Deadline">
                <span className="text-sm">{formatDate(request.deadlineAt)}</span>
              </SidebarField>
            )}

            <div className="border-b border-zinc-800/50 pb-4">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Assignees</div>
              <AssignPanel requestId={request.id} />
            </div>

            <SidebarField label="Requester">
              <span className="text-sm">{requester?.fullName ?? "Unknown"}</span>
              <span className="text-xs text-zinc-600 capitalize ml-1">({requester?.role})</span>
            </SidebarField>

            <SidebarField label="Created">
              <span className="text-sm text-zinc-400">{formatDate(request.createdAt)}</span>
            </SidebarField>
          </div>
        </div>
      </main>
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-green-400 bg-green-500/10 border-green-500/20" :
    score >= 50 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
    "text-red-400 bg-red-500/10 border-red-500/20";

  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${color}`}>
      Quality: {score}/100
    </span>
  );
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-800/50 pb-4">
      <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">{label}</div>
      <div className="text-zinc-300">{children}</div>
    </div>
  );
}
