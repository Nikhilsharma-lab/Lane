"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewRequestForm } from "./new-request-form";
import type { Request } from "@/db/schema";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";

// ── Styling helpers ─────────────────────────────────────────────────────────

const priorityColors: Record<string, string> = {
  p0: "bg-red-500/15 text-red-400 border-red-500/20",
  p1: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  p2: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  p3: "bg-zinc-700/50 text-zinc-400 border-zinc-700",
};

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature", bug: "Bug", research: "Research",
  content: "Content", infra: "Infra", process: "Process", other: "Other",
};

// ── Phase definitions ────────────────────────────────────────────────────────

const PHASES = [
  {
    key: "predesign",
    label: "Predesign",
    number: "1",
    desc: "PM + Org decides what to build",
    color: "text-indigo-400",
    borderColor: "border-indigo-500/20",
    bgColor: "bg-indigo-500/5",
    dotColor: "bg-indigo-400",
    stages: ["intake", "context", "shape", "bet"],
    stageLabels: { intake: "Intake", context: "Context", shape: "Shape", bet: "Betting" },
    stageBadge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  {
    key: "design",
    label: "Design",
    number: "2",
    desc: "Designer builds the solution",
    color: "text-purple-400",
    borderColor: "border-purple-500/20",
    bgColor: "bg-purple-500/5",
    dotColor: "bg-purple-400",
    stages: ["explore", "validate", "handoff"],
    stageLabels: { explore: "Explore", validate: "Validate", handoff: "Handoff" },
    stageBadge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    key: "dev",
    label: "Dev",
    number: "3",
    desc: "Developers build and ship",
    color: "text-blue-400",
    borderColor: "border-blue-500/20",
    bgColor: "bg-blue-500/5",
    dotColor: "bg-blue-400",
    stages: ["todo", "in_progress", "in_review", "qa", "done"],
    stageLabels: { todo: "To Do", in_progress: "In Progress", in_review: "In Review", qa: "QA", done: "Done" },
    stageBadge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    key: "track",
    label: "Track & Impact",
    number: "4",
    desc: "PM measures results",
    color: "text-green-400",
    borderColor: "border-green-500/20",
    bgColor: "bg-green-500/5",
    dotColor: "bg-green-400",
    stages: ["measuring", "complete"],
    stageLabels: { measuring: "Measuring", complete: "Complete" },
    stageBadge: "bg-green-500/10 text-green-400 border-green-500/20",
  },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEffectivePhaseAndStage(r: Request): { phaseKey: PhaseKey; subStage: string; phaseOrder: number; stageOrder: number } {
  // New phase model
  if (r.phase) {
    const phaseOrder = ["predesign", "design", "dev", "track"].indexOf(r.phase);
    switch (r.phase) {
      case "predesign": {
        const sub = r.predesignStage ?? r.stage ?? "intake";
        return { phaseKey: "predesign", subStage: sub, phaseOrder, stageOrder: ["intake","context","shape","bet"].indexOf(sub) };
      }
      case "design": {
        const sub = r.designStage ?? "explore";
        return { phaseKey: "design", subStage: sub, phaseOrder, stageOrder: ["explore","validate","handoff"].indexOf(sub) };
      }
      case "dev": {
        const sub = r.kanbanState ?? "todo";
        return { phaseKey: "dev", subStage: sub, phaseOrder, stageOrder: ["todo","in_progress","in_review","qa","done"].indexOf(sub) };
      }
      case "track": {
        const sub = r.trackStage ?? "measuring";
        return { phaseKey: "track", subStage: sub, phaseOrder, stageOrder: ["measuring","complete"].indexOf(sub) };
      }
    }
  }

  // Legacy fallback: map stage → phase
  const stage = r.stage ?? "intake";
  if (["intake","context","shape","bet"].includes(stage))
    return { phaseKey: "predesign", subStage: stage, phaseOrder: 0, stageOrder: ["intake","context","shape","bet"].indexOf(stage) };
  if (["explore","validate","handoff"].includes(stage))
    return { phaseKey: "design", subStage: stage, phaseOrder: 1, stageOrder: ["explore","validate","handoff"].indexOf(stage) };
  if (stage === "build")
    return { phaseKey: "dev", subStage: "in_progress", phaseOrder: 2, stageOrder: 1 };
  return { phaseKey: "track", subStage: "measuring", phaseOrder: 3, stageOrder: 0 };
}

const PRIORITY_ORDER: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

function priorityOrder(r: Request) {
  return r.priority ? (PRIORITY_ORDER[r.priority] ?? 4) : 4;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deadlineStatus(deadlineAt: Date | string | null) {
  if (!deadlineAt) return null;
  const days = (new Date(deadlineAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return { label: "overdue", color: "text-red-400 bg-red-500/10 border-red-500/20" };
  if (days <= 3) return { label: `${Math.ceil(days)}d left`, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" };
  if (days <= 7) return { label: `${Math.ceil(days)}d left`, color: "text-yellow-500/80 bg-yellow-500/10 border-yellow-500/20" };
  return null;
}

const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);
function isStalled(r: Request) {
  if (STALL_EXEMPT.has(r.status)) return false;
  return (Date.now() - new Date(r.updatedAt).getTime()) / 86_400_000 >= 5;
}

function Initials({ name }: { name: string }) {
  const init = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-5 h-5 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center text-[9px] font-medium text-zinc-300 shrink-0">
      {init}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  requests: Request[];
  myRequestIds?: Set<string>;
  assigneesByRequest?: Record<string, string[]>;
}

export function RequestList({ requests, myRequestIds, assigneesByRequest = {} }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<PhaseKey>>(new Set());

  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const hasMine = myRequestIds && myRequestIds.size > 0;
  const availableTypes = [...new Set(requests.map((r) => r.requestType).filter(Boolean))] as string[];

  // Filter
  let visible = filter === "mine" && myRequestIds
    ? requests.filter((r) => myRequestIds.has(r.id))
    : requests;
  if (typeFilter !== "all") visible = visible.filter((r) => r.requestType === typeFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    visible = visible.filter(
      (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    );
  }

  // Group by phase → sort within each group by stage then priority
  const grouped = new Map<PhaseKey, Array<Request & { subStage: string; stageOrder: number }>>();
  for (const phase of PHASES) grouped.set(phase.key, []);

  for (const r of visible) {
    const { phaseKey, subStage, stageOrder } = getEffectivePhaseAndStage(r);
    grouped.get(phaseKey)!.push({ ...r, subStage, stageOrder });
  }
  for (const [, list] of grouped) {
    list.sort((a, b) => a.stageOrder - b.stageOrder || priorityOrder(a) - priorityOrder(b));
  }

  // Flatten all visible requests for J/K indexing
  const flatVisible = PHASES.flatMap((phase) => grouped.get(phase.key) ?? []);
  const { focused, setFocused } = useKeyboardNav(flatVisible.length);

  // Handle Enter (open) and / (focus search) at list level
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;
      if (isInput) return;

      if (e.key === "Enter" && focused >= 0) {
        e.preventDefault();
        router.push(`/dashboard/requests/${flatVisible[focused].id}`);
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, flatVisible, router]);

  function toggleCollapse(key: PhaseKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      {showForm && <NewRequestForm onClose={() => setShowForm(false)} />}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Requests</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{visible.length} total</p>
          </div>
          {hasMine && (
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <button onClick={() => setFilter("all")} className={`text-xs px-2.5 py-1 rounded transition-colors ${filter === "all" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>All</button>
              <button onClick={() => setFilter("mine")} className={`text-xs px-2.5 py-1 rounded transition-colors ${filter === "mine" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Mine</button>
            </div>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="bg-white text-zinc-900 rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 transition-colors">
          + New request
        </button>
      </div>

      {/* Search + type filter */}
      <div className="space-y-2 mb-6">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search requests…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />
        {availableTypes.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setTypeFilter("all")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${typeFilter === "all" ? "bg-zinc-800 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"}`}>All types</button>
            {availableTypes.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)} className={`text-xs px-2.5 py-1 rounded-lg capitalize transition-colors ${typeFilter === t ? "bg-zinc-800 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"}`}>
                {TYPE_LABELS[t] ?? t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Phase-grouped sections */}
      <div className="space-y-6">
        {PHASES.map((phase) => {
          const list = grouped.get(phase.key)!;
          const isCollapsed = collapsed.has(phase.key);

          return (
            <div key={phase.key}>
              {/* Phase header */}
              <button
                onClick={() => toggleCollapse(phase.key)}
                className="w-full flex items-center gap-3 mb-3 group"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${phase.dotColor} shrink-0`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${phase.color}`}>
                  Phase {phase.number} — {phase.label}
                </span>
                <span className="text-[10px] text-zinc-700">{phase.desc}</span>
                <div className="flex-1 h-px bg-zinc-800/60 mx-1" />
                <span className={`text-[10px] font-mono ${list.length > 0 ? "text-zinc-400" : "text-zinc-700"}`}>
                  {list.length}
                </span>
                <span className="text-[10px] text-zinc-700 group-hover:text-zinc-500 transition-colors">
                  {isCollapsed ? "▸" : "▾"}
                </span>
              </button>

              {!isCollapsed && (
                <>
                  {list.length === 0 ? (
                    <div className="border border-dashed border-zinc-800/60 rounded-xl px-5 py-4 text-center">
                      <p className="text-xs text-zinc-700">No requests in this phase</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {list.map((r, listIdx) => {
                        const phaseStartIndex = PHASES.slice(0, PHASES.indexOf(phase)).reduce(
                          (sum, p) => sum + (grouped.get(p.key)?.length ?? 0),
                          0
                        );
                        const itemIndex = phaseStartIndex + listIdx;
                        const isFocused = focused === itemIndex;

                        const deadline = deadlineStatus(r.deadlineAt);
                        const assignees = assigneesByRequest[r.id] ?? [];
                        const stageDef = PHASES.find((p) => p.key === phase.key);
                        const stageLabel = (stageDef?.stageLabels as Record<string, string>)?.[r.subStage] ?? r.subStage;

                        return (
                          <Link
                            key={r.id}
                            href={`/dashboard/requests/${r.id}`}
                            onClick={() => setFocused(itemIndex)}
                            className={`block border rounded-xl px-5 py-3.5 transition-colors ${
                              isFocused
                                ? "border-l-2 border-l-indigo-500 border-zinc-700 bg-zinc-900"
                                : "border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  {/* Sub-stage badge */}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${phase.stageBadge}`}>
                                    {stageLabel}
                                  </span>
                                  {r.priority && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${priorityColors[r.priority]}`}>
                                      {r.priority.toUpperCase()}
                                    </span>
                                  )}
                                  {r.requestType && (
                                    <span className="text-[10px] text-zinc-600 capitalize">{TYPE_LABELS[r.requestType] ?? r.requestType}</span>
                                  )}
                                  {deadline && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${deadline.color}`}>{deadline.label}</span>
                                  )}
                                  {isStalled(r) && (
                                    <span className="text-[10px] text-yellow-500/70 bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5">stalled</span>
                                  )}
                                </div>
                                <p className="text-sm text-white font-medium truncate">{r.title}</p>
                                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{r.description}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                {assignees.length > 0 && (
                                  <div className="flex items-center gap-0.5">
                                    {assignees.slice(0, 3).map((name) => <Initials key={name} name={name} />)}
                                    {assignees.length > 3 && <span className="text-[9px] text-zinc-600 ml-0.5">+{assignees.length - 3}</span>}
                                  </div>
                                )}
                                <span className="text-[10px] text-zinc-700">{formatDate(r.createdAt)}</span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Keyboard hint bar — desktop only */}
      <div className="hidden md:flex items-center gap-4 pt-4 pb-2">
        <span className="text-[10px] text-zinc-700">J/K navigate</span>
        <span className="text-[10px] text-zinc-700">↵ open</span>
        <span className="text-[10px] text-zinc-700">/ search</span>
        <span className="text-[10px] text-zinc-700">? shortcuts</span>
      </div>

      {visible.length === 0 && (
        <div className="border border-zinc-800 rounded-xl p-16 text-center mt-4">
          {search ? (
            <>
              <p className="text-zinc-600 text-sm mb-1">No results for &ldquo;{search}&rdquo;</p>
              <button onClick={() => setSearch("")} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-2">Clear search</button>
            </>
          ) : (
            <>
              <p className="text-zinc-600 text-sm mb-1">No requests yet</p>
              <p className="text-zinc-700 text-xs mb-5">Submit one to see AI triage in action</p>
              <button onClick={() => setShowForm(true)} className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2 transition-colors">
                + New request
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
