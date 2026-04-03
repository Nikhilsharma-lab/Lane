"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NewRequestForm } from "./new-request-form";
import type { Request } from "@/db/schema";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";

// ── Styling helpers ─────────────────────────────────────────────────────────

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
    color: "text-[#D4A84B]",
    borderColor: "border-[#D4A84B]/20",
    bgColor: "bg-[#D4A84B]/5",
    dotColor: "bg-[#D4A84B]",
    stages: ["intake", "context", "shape", "bet"],
    stageLabels: { intake: "Intake", context: "Context", shape: "Shape", bet: "Betting" },
    stageBadge: "bg-[#D4A84B]/10 text-[#D4A84B] border-[#D4A84B]/20",
  },
  {
    key: "design",
    label: "Design",
    number: "2",
    desc: "Designer builds the solution",
    color: "text-[#A394C7]",
    borderColor: "border-[#A394C7]/20",
    bgColor: "bg-[#A394C7]/5",
    dotColor: "bg-[#A394C7]",
    stages: ["explore", "validate", "handoff"],
    stageLabels: { explore: "Explore", validate: "Validate", handoff: "Handoff" },
    stageBadge: "bg-[#A394C7]/10 text-[#A394C7] border-[#A394C7]/20",
  },
  {
    key: "dev",
    label: "Dev",
    number: "3",
    desc: "Developers build and ship",
    color: "text-[#7DA5C4]",
    borderColor: "border-[#7DA5C4]/20",
    bgColor: "bg-[#7DA5C4]/5",
    dotColor: "bg-[#7DA5C4]",
    stages: ["todo", "in_progress", "in_review", "qa", "done"],
    stageLabels: { todo: "To Do", in_progress: "In Progress", in_review: "In Review", qa: "QA", done: "Done" },
    stageBadge: "bg-[#7DA5C4]/10 text-[#7DA5C4] border-[#7DA5C4]/20",
  },
  {
    key: "track",
    label: "Track & Impact",
    number: "4",
    desc: "PM measures results",
    color: "text-[#86A87A]",
    borderColor: "border-[#86A87A]/20",
    bgColor: "bg-[#86A87A]/5",
    dotColor: "bg-[#86A87A]",
    stages: ["measuring", "complete"],
    stageLabels: { measuring: "Measuring", complete: "Complete" },
    stageBadge: "bg-[#86A87A]/10 text-[#86A87A] border-[#86A87A]/20",
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
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        fontSize: 9,
        fontWeight: 600,
        color: "var(--text-secondary)",
      }}
    >
      {init}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  requests: Request[];
  myRequestIds?: Set<string>;
  assigneesByRequest?: Record<string, string[]>;
  projects?: { id: string; name: string; color: string }[];
  projectMap?: Record<string, { name: string; color: string }>;
}

export function RequestList({ requests, myRequestIds, assigneesByRequest = {}, projects = [], projectMap = {} }: Props) {
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
        const target = flatVisible[focused];
        if (!target) return;
        const params = new URLSearchParams(window.location.search);
        params.set("dock", target.id);
        router.push(`?${params.toString()}`);
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
      {showForm && <NewRequestForm onClose={() => setShowForm(false)} projects={projects} />}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
              Requests
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              {visible.length} total
            </p>
          </div>
          {hasMine && (
            <div
              className="flex items-center gap-1 rounded-lg p-1"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              <button
                onClick={() => setFilter("all")}
                className="rounded"
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  background: filter === "all" ? "var(--bg-hover)" : "transparent",
                  color: filter === "all" ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                All
              </button>
              <button
                onClick={() => setFilter("mine")}
                className="rounded"
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  background: filter === "mine" ? "var(--bg-hover)" : "transparent",
                  color: filter === "mine" ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Mine
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md flex items-center gap-2"
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            fontSize: 13,
            fontWeight: 600,
            padding: "7px 14px",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
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
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        {availableTypes.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setTypeFilter("all")}
              className="rounded-lg transition-colors"
              style={{
                fontSize: 12,
                padding: "4px 10px",
                background: typeFilter === "all" ? "var(--bg-hover)" : "var(--bg-surface)",
                color: typeFilter === "all" ? "var(--text-primary)" : "var(--text-tertiary)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              All types
            </button>
            {availableTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className="rounded-lg capitalize transition-colors"
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  background: typeFilter === t ? "var(--bg-hover)" : "var(--bg-surface)",
                  color: typeFilter === t ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
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
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Phase {phase.number} — {phase.label}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{phase.desc}</span>
                <div className="flex-1 h-px mx-1" style={{ background: "var(--border)" }} />
                <span
                  className="font-mono"
                  style={{ fontSize: 10, color: list.length > 0 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
                >
                  {list.length}
                </span>
                <span
                  className="transition-colors"
                  style={{ fontSize: 10, color: "var(--text-tertiary)" }}
                >
                  {isCollapsed ? "▸" : "▾"}
                </span>
              </button>

              {!isCollapsed && (
                <>
                  {list.length === 0 ? (
                    <div
                      className="rounded-xl px-5 py-4 text-center"
                      style={{ border: "1px dashed var(--border)" }}
                    >
                      <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No requests in this phase</p>
                    </div>
                  ) : (
                    <div>
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
                          <div
                            key={r.id}
                            onClick={() => {
                              setFocused(itemIndex);
                              const params = new URLSearchParams(window.location.search);
                              params.set("dock", r.id);
                              router.push(`?${params.toString()}`);
                            }}
                            className="cursor-pointer rounded-lg px-4 py-3 transition-colors"
                            style={{
                              background: "var(--bg-surface)",
                              border: `1px solid ${isFocused ? "var(--accent)" : "var(--border)"}`,
                              marginBottom: 6,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
                          >
                            {/* Top row: ID + title + priority */}
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  style={{
                                    fontFamily: "'Geist Mono', monospace",
                                    fontSize: 9,
                                    color: "var(--text-tertiary)",
                                    letterSpacing: "0.03em",
                                    flexShrink: 0,
                                  }}
                                >
                                  #{r.id.slice(0, 6).toUpperCase()}
                                </span>
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {r.title}
                                </span>
                              </div>
                              {r.priority && (
                                <span
                                  className="shrink-0 rounded"
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: "2px 6px",
                                    background: r.priority === "p0" ? "#FEE2E2" : r.priority === "p1" ? "#FFEDD5" : r.priority === "p2" ? "#FEF9C3" : "var(--bg-hover)",
                                    color: r.priority === "p0" ? "#DC2626" : r.priority === "p1" ? "#C2410C" : r.priority === "p2" ? "#A16207" : "var(--text-secondary)",
                                  }}
                                >
                                  {r.priority.toUpperCase()}
                                </span>
                              )}
                            </div>

                            {/* Bottom row: phase·stage + deadline + stalled + assignees */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  style={{
                                    fontFamily: "'Geist Mono', monospace",
                                    fontSize: 9,
                                    color: "var(--text-tertiary)",
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {phase.label} · {stageLabel}
                                </span>
                                {deadline && (
                                  <span
                                    className="rounded"
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 500,
                                      padding: "1px 5px",
                                      background: "#FEF3C7",
                                      color: "#B45309",
                                    }}
                                  >
                                    {deadline.label}
                                  </span>
                                )}
                                {isStalled(r) && (
                                  <span style={{ fontSize: 10, color: "#B45309" }}>stalled</span>
                                )}
                                {r.requestType && (
                                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{TYPE_LABELS[r.requestType] ?? r.requestType}</span>
                                )}
                              </div>
                              {assignees.length > 0 && (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {assignees.slice(0, 3).map((name) => <Initials key={name} name={name} />)}
                                  {assignees.length > 3 && <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginLeft: 2 }}>+{assignees.length - 3}</span>}
                                </div>
                              )}
                            </div>
                          </div>
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
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>J/K navigate</span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>↵ open</span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>/ search</span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>? shortcuts</span>
      </div>

      {visible.length === 0 && (
        <div
          className="rounded-xl p-16 text-center mt-4"
          style={{ border: "1px solid var(--border)" }}
        >
          {search ? (
            <>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 4 }}>No results for &ldquo;{search}&rdquo;</p>
              <button
                onClick={() => setSearch("")}
                className="transition-colors mt-2"
                style={{ fontSize: 12, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 4 }}>No requests yet</p>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 20 }}>Submit one to see AI triage in action</p>
              <button
                onClick={() => setShowForm(true)}
                className="rounded-lg transition-colors"
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  padding: "8px 16px",
                  background: "var(--bg-surface)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                + New request
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
