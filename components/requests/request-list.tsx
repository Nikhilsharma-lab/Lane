"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NewRequestForm } from "./new-request-form";
import type { Request } from "@/db/schema";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterChips, type FilterChip } from "@/components/ui/filter-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchX } from "lucide-react";

// ── Phase definitions ────────────────────────────────────────────────────────

const PHASES = [
  {
    key: "predesign",
    label: "Predesign",
    number: "1",
    stages: ["intake", "context", "shape", "bet"],
    stageLabels: { intake: "Intake", context: "Context", shape: "Shape", bet: "Betting" },
  },
  {
    key: "design",
    label: "Design",
    number: "2",
    stages: ["sense", "frame", "diverge", "converge", "prove"],
    stageLabels: { sense: "Sense", frame: "Frame", diverge: "Diverge", converge: "Converge", prove: "Prove" },
  },
  {
    key: "dev",
    label: "Dev",
    number: "3",
    stages: ["todo", "in_progress", "in_review", "qa", "done"],
    stageLabels: { todo: "To Do", in_progress: "In Progress", in_review: "In Review", qa: "QA", done: "Done" },
  },
  {
    key: "track",
    label: "Track",
    number: "4",
    stages: ["measuring", "complete"],
    stageLabels: { measuring: "Measuring", complete: "Complete" },
  },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];
type PhaseFilter = "all" | PhaseKey;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEffectivePhaseAndStage(r: Request): {
  phaseKey: PhaseKey;
  subStage: string;
  phaseOrder: number;
  stageOrder: number;
} {
  if (r.phase) {
    const phaseOrder = ["predesign", "design", "dev", "track"].indexOf(r.phase);
    switch (r.phase) {
      case "predesign": {
        const sub = r.predesignStage ?? r.stage ?? "intake";
        return { phaseKey: "predesign", subStage: sub, phaseOrder, stageOrder: ["intake","context","shape","bet"].indexOf(sub) };
      }
      case "design": {
        const sub = r.designStage ?? "sense";
        return { phaseKey: "design", subStage: sub, phaseOrder, stageOrder: ["sense","frame","diverge","converge","prove"].indexOf(sub) };
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

// ── Sub-components ───────────────────────────────────────────────────────────

const STAGE_COLORS: Record<PhaseKey, { bg: string; text: string; border: string }> = {
  predesign: { bg: "rgba(212,168,75,0.12)",  text: "#9a6b12", border: "rgba(212,168,75,0.25)"  },
  design:    { bg: "rgba(163,148,199,0.12)", text: "#7c6fad", border: "rgba(163,148,199,0.25)" },
  dev:       { bg: "rgba(125,165,196,0.12)", text: "#4a7fa0", border: "rgba(125,165,196,0.25)" },
  track:     { bg: "rgba(134,168,122,0.12)", text: "#4a7a40", border: "rgba(134,168,122,0.25)" },
};

function StageBadge({ label, phaseKey }: { label: string; phaseKey: PhaseKey }) {
  const c = STAGE_COLORS[phaseKey];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 500,
        fontFamily: "'Geist Mono', monospace",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Geist Mono', monospace",
        background: `var(--priority-${priority}-bg)`,
        color: `var(--priority-${priority}-text)`,
      }}
    >
      {priority.toUpperCase()}
    </span>
  );
}

function DesignerInitials({ name }: { name: string }) {
  const init = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 600,
        color: "var(--text-secondary)",
        flexShrink: 0,
      }}
    >
      {init}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  requests: Request[];
  myRequestIds?: Set<string>;
  assigneesByRequest?: Record<string, string[]>;
  projects?: { id: string; name: string; color: string }[];
  projectMap?: Record<string, { name: string; color: string }>;
  headerContent?: React.ReactNode;
}

const PHASE_TABS: { key: PhaseFilter; label: string }[] = [
  { key: "all",       label: "All"       },
  { key: "predesign", label: "Predesign" },
  { key: "design",    label: "Design"    },
  { key: "dev",       label: "Dev"       },
  { key: "track",     label: "Track"     },
];

export function RequestList({
  requests,
  myRequestIds,
  assigneesByRequest = {},
  projects = [],
  projectMap = {},
  headerContent,
}: Props) {
  const [showForm, setShowForm]       = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [search, setSearch]           = useState("");

  const router       = useRouter();
  const searchParams = useSearchParams();
  const activeDockId = searchParams.get("dock");
  const searchRef    = useRef<HTMLInputElement>(null);

  // ── URL-based filter params ─────────────────────────────────────────────
  const urlPhase    = searchParams.get("phase");
  const urlPriority = searchParams.get("priority");
  const urlStage    = searchParams.get("stage");
  const urlProject  = searchParams.get("project");
  const urlAssignee = searchParams.get("assignee");

  // Sync phase tab with URL param on mount / change
  useEffect(() => {
    if (urlPhase && ["predesign", "design", "dev", "track"].includes(urlPhase)) {
      setPhaseFilter(urlPhase as PhaseFilter);
    }
  }, [urlPhase]);

  const PRIORITY_LABELS: Record<string, string> = { p0: "P0", p1: "P1", p2: "P2", p3: "P3" };

  const filterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (urlPhase) {
      const phaseDef = PHASES.find((p) => p.key === urlPhase);
      chips.push({ key: "phase", label: "Phase", value: phaseDef?.label ?? urlPhase, rawValue: urlPhase });
    }
    if (urlPriority) {
      chips.push({ key: "priority", label: "Priority", value: PRIORITY_LABELS[urlPriority] ?? urlPriority.toUpperCase(), rawValue: urlPriority });
    }
    if (urlStage) {
      // Find the stage label from any phase
      let stageLabel = urlStage;
      for (const p of PHASES) {
        const found = (p.stageLabels as Record<string, string>)[urlStage];
        if (found) { stageLabel = found; break; }
      }
      chips.push({ key: "stage", label: "Stage", value: stageLabel, rawValue: urlStage });
    }
    if (urlProject) {
      const proj = projectMap[urlProject];
      chips.push({ key: "project", label: "Project", value: proj?.name ?? urlProject, rawValue: urlProject });
    }
    if (urlAssignee) {
      chips.push({ key: "assignee", label: "Assignee", value: urlAssignee, rawValue: urlAssignee });
    }
    return chips;
  }, [urlPhase, urlPriority, urlStage, urlProject, urlAssignee, projectMap]);

  const handleRemoveFilter = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    router.push(`?${params.toString()}`);
    if (key === "phase") setPhaseFilter("all");
  }, [searchParams, router]);

  const handleClearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of ["phase", "priority", "stage", "project", "assignee"]) {
      params.delete(k);
    }
    router.push(`?${params.toString()}`);
    setPhaseFilter("all");
  }, [searchParams, router]);

  // Filter
  let visible = requests;
  if (phaseFilter !== "all") {
    visible = visible.filter((r) => getEffectivePhaseAndStage(r).phaseKey === phaseFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    visible = visible.filter(
      (r) => r.title.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
    );
  }
  // URL-based filters
  if (urlPriority) {
    visible = visible.filter((r) => r.priority === urlPriority);
  }
  if (urlStage) {
    visible = visible.filter((r) => {
      const { subStage } = getEffectivePhaseAndStage(r);
      return subStage === urlStage;
    });
  }
  if (urlProject) {
    visible = visible.filter((r) => r.projectId === urlProject);
  }
  if (urlAssignee) {
    visible = visible.filter((r) => {
      const assignees = assigneesByRequest[r.id] ?? [];
      return assignees.some((name) => name.toLowerCase().includes(urlAssignee.toLowerCase()));
    });
  }

  // Sort: phase → stage → priority
  const sorted = [...visible].sort((a, b) => {
    const ea = getEffectivePhaseAndStage(a);
    const eb = getEffectivePhaseAndStage(b);
    if (ea.phaseOrder !== eb.phaseOrder) return ea.phaseOrder - eb.phaseOrder;
    if (ea.stageOrder !== eb.stageOrder) return ea.stageOrder - eb.stageOrder;
    return priorityOrder(a) - priorityOrder(b);
  });

  const { focused, setFocused } = useKeyboardNav(sorted.length);

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
        const target = sorted[focused];
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
  }, [focused, sorted, router]);

  return (
    <>
      {showForm && (
        <NewRequestForm onClose={() => setShowForm(false)} projects={projects} />
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 52,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-surface)",
        }}
      >
        {/* Left: title + phase tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            My Work
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {PHASE_TABS.map((tab) => {
              const active = phaseFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setPhaseFilter(tab.key)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "'Geist Mono', monospace",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--text-primary)" : "transparent",
                    color: active ? "#ffffff" : "var(--text-tertiary)",
                    transition: "background 0.1s, color 0.1s",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: search + count + new */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search… (/)"
            style={{
              height: 28,
              padding: "0 8px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: search ? "var(--bg-surface)" : "var(--bg-subtle)",
              fontSize: 11,
              fontFamily: "'Geist Mono', monospace",
              color: "var(--text-primary)",
              outline: "none",
              width: search ? 160 : 100,
              transition: "width 0.2s, border-color 0.15s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
            onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "var(--text-tertiary)",
            }}
          >
            {sorted.length}
          </span>
          <button
            onClick={() => setShowForm(true)}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: 600,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            + New
          </button>
        </div>
      </div>

      {/* ── Header content slot (briefing card, alerts, etc.) ─────────────── */}
      {headerContent}

      {/* ── Filter chips ──────────────────────────────────────────────────── */}
      {filterChips.length > 0 && (
        <div style={{ padding: "0 20px" }}>
          <FilterChips
            chips={filterChips}
            onRemove={handleRemoveFilter}
            onClearAll={handleClearAll}
          />
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {sorted.length === 0 && (search || filterChips.length > 0) ? (
        <EmptyState
          icon={SearchX}
          title="No requests match your filters."
          subtitle={search ? `No results for "${search}"` : "Try removing some filters to see more requests."}
          cta={{ label: "Clear filters", onClick: handleClearAll }}
        />
      ) : (
      <Table>
        <TableHeader>
          <TableRow
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-surface)",
            }}
          >
            <TableHead
              style={{
                width: 64,
                paddingLeft: 20,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                letterSpacing: "0.06em",
              }}
            >
              ID
            </TableHead>
            <TableHead
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                letterSpacing: "0.06em",
              }}
            >
              REQUEST
            </TableHead>
            <TableHead
              style={{
                width: 110,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                letterSpacing: "0.06em",
              }}
            >
              STAGE
            </TableHead>
            <TableHead
              style={{
                width: 88,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                letterSpacing: "0.06em",
              }}
            >
              DESIGNER
            </TableHead>
            <TableHead
              style={{
                width: 80,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                letterSpacing: "0.06em",
              }}
            >
              PRIORITY
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sorted.length === 0 ? (
            <TableRow style={{ borderColor: "transparent" }}>
              <TableCell
                colSpan={5}
                style={{ textAlign: "center", padding: "56px 0" }}
              >
                <p
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    marginBottom: 8,
                  }}
                >
                  {search
                    ? `No results for "${search}"`
                    : phaseFilter !== "all"
                    ? `No requests in ${phaseFilter} phase`
                    : "No requests yet"}
                </p>
                {!search && (
                  <button
                    onClick={() => setShowForm(true)}
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    + New request
                  </button>
                )}
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((r, idx) => {
              const { phaseKey, subStage } = getEffectivePhaseAndStage(r);
              const phaseDef  = PHASES.find((p) => p.key === phaseKey)!;
              const stageLabel =
                (phaseDef.stageLabels as Record<string, string>)[subStage] ?? subStage;
              const assignees  = assigneesByRequest[r.id] ?? [];
              const isActive   = r.id === activeDockId;
              const isFocused  = focused === idx;

              return (
                <TableRow
                  key={r.id}
                  data-state={isActive ? "selected" : undefined}
                  onClick={() => {
                    setFocused(idx);
                    const params = new URLSearchParams(window.location.search);
                    params.set("dock", r.id);
                    router.push(`?${params.toString()}`);
                  }}
                  style={{
                    cursor: "pointer",
                    borderColor: "var(--border-subtle)",
                    borderLeft: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    background: isActive
                      ? "var(--accent-soft)"
                      : isFocused
                      ? "var(--bg-subtle)"
                      : "transparent",
                    outline: "none",
                  }}
                  className="transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  {/* ID */}
                  <TableCell
                    style={{
                      paddingLeft: 18,
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {r.id.slice(0, 6).toUpperCase()}
                  </TableCell>

                  {/* Title + project */}
                  <TableCell style={{ paddingRight: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span
                        style={{
                          fontFamily: "'Geist', sans-serif",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 400,
                          display: "block",
                        }}
                      >
                        {r.title}
                      </span>
                      {r.projectId && projectMap[r.projectId] && (
                        <span
                          style={{
                            fontFamily: "'Geist Mono', monospace",
                            fontSize: 10,
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {projectMap[r.projectId].name}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Stage badge */}
                  <TableCell>
                    <StageBadge label={stageLabel} phaseKey={phaseKey} />
                  </TableCell>

                  {/* Designer initials */}
                  <TableCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      {assignees.slice(0, 2).map((name) => (
                        <DesignerInitials key={name} name={name} />
                      ))}
                      {assignees.length > 2 && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--text-tertiary)",
                            fontFamily: "'Geist Mono', monospace",
                          }}
                        >
                          +{assignees.length - 2}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Priority */}
                  <TableCell>
                    {r.priority && <PriorityBadge priority={r.priority} />}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      )}

      {/* ── Keyboard hints ───────────────────────────────────────────────── */}
      <div
        className="hidden md:flex items-center gap-4"
        style={{
          padding: "6px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        {(["J/K navigate", "↵ open", "/ search", "⌘K command"] as const).map((hint) => (
          <span
            key={hint}
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "var(--text-tertiary)",
            }}
          >
            {hint}
          </span>
        ))}
      </div>
    </>
  );
}
