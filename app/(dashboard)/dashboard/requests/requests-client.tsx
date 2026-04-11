"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { Search, Plus } from "lucide-react";
import {
  KANBAN_STATES,
  KANBAN_STATE_LABELS,
  type CardData,
  type KanbanState,
} from "@/components/dev-board/types";
import { KanbanColumn } from "@/components/dev-board/kanban-column";
import { BoardView } from "@/components/requests/board-view";
import { GroupByDropdown, type GroupByOption } from "@/components/requests/group-by-dropdown";
import { ViewModeToggle, type ViewMode } from "@/components/requests/view-mode-toggle";
import { SaveViewButton } from "@/components/requests/save-view-button";
import { FilterChips, type FilterChip } from "@/components/ui/filter-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { DESIGN_STAGES, getActiveStageLabel, getPhaseLabel } from "@/lib/workflow";
import type { Request, Project } from "@/db/schema";
import { InboxIcon } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type PhaseFilter = "all" | "predesign" | "design" | "dev" | "track";

// ── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "'Geist Mono', monospace",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "1px 6px",
        borderRadius: 4,
        background: `var(--priority-${priority}-bg)`,
        color: `var(--priority-${priority}-text)`,
        flexShrink: 0,
      }}
    >
      {priority.toUpperCase()}
    </span>
  );
}

// ── Phase tab config ─────────────────────────────────────────────────────────

const PHASE_TABS: { key: PhaseFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "predesign", label: "Predesign" },
  { key: "design", label: "Design" },
  { key: "dev", label: "Dev" },
  { key: "track", label: "Impact" },
];

// ── Available view modes per phase ───────────────────────────────────────────

function getAvailableModes(phase: PhaseFilter): ViewMode[] {
  if (phase === "dev") return ["list", "kanban"];
  if (phase === "design") return ["list", "board"];
  return ["list"];
}

function getDefaultMode(phase: PhaseFilter): ViewMode {
  if (phase === "dev") return "kanban";
  if (phase === "design") return "board";
  return "list";
}

// ── Design board columns ─────────────────────────────────────────────────────

const DESIGN_BOARD_COLUMNS = DESIGN_STAGES.map((s) => ({
  key: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialRequests: Request[];
  projects: Project[];
  projectMap: Record<string, { name: string; color: string }>;
  assigneesByRequest: Record<string, string[]>;
  memberMap: Record<string, string>;
  searchParams: Record<string, string | string[] | undefined>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sp(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return typeof v === "string" ? v : "";
}

function toCardData(
  r: Request,
  projectMap: Record<string, { name: string; color: string }>,
  assigneesByRequest: Record<string, string[]>
): CardData {
  const proj = r.projectId ? projectMap[r.projectId] : null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    businessContext: r.businessContext ?? null,
    priority: r.priority ?? null,
    requestType: r.requestType ?? null,
    kanbanState: (r.kanbanState ?? "todo") as KanbanState,
    projectId: r.projectId ?? null,
    projectName: proj?.name ?? null,
    projectColor: proj?.color ?? null,
    assignees: assigneesByRequest[r.id] ?? [],
    deadlineAt: r.deadlineAt ? r.deadlineAt.toISOString() : null,
    figmaUrl: r.figmaUrl ?? null,
    figmaLockedAt: r.figmaLockedAt ? r.figmaLockedAt.toISOString() : null,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function RequestsClient({
  initialRequests,
  projects,
  projectMap,
  assigneesByRequest,
  memberMap,
  searchParams,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // ── URL-driven state ────────────────────────────────────────────────────────
  const phaseFilter = (sp(searchParams, "phase") || "all") as PhaseFilter;
  const groupBy = (sp(searchParams, "group") || "none") as GroupByOption;
  const rawView = sp(searchParams, "view") as ViewMode | "";
  const viewMode: ViewMode = rawView || getDefaultMode(phaseFilter);
  const searchQuery = sp(searchParams, "q");
  const projectFilter = sp(searchParams, "project");
  const priorityFilter = sp(searchParams, "priority");

  // ── Local state ─────────────────────────────────────────────────────────────
  const [localRequests, setLocalRequests] = useState(initialRequests);
  const [showNewForm, setShowNewForm] = useState(false);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalRequests(initialRequests);
  }, [initialRequests]);

  // ── URL update helper ───────────────────────────────────────────────────────
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams();
      // Carry forward existing params
      for (const [k, v] of Object.entries(searchParams)) {
        if (typeof v === "string") params.set(k, v);
      }
      // Apply updates
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "" || v === "none" || v === "all") {
          params.delete(k);
        } else {
          params.set(k, v);
        }
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [searchParams, router, pathname]
  );

  // ── Phase change: reset view to sensible default ────────────────────────────
  function handlePhaseChange(phase: PhaseFilter) {
    const availModes = getAvailableModes(phase);
    const defaultMode = getDefaultMode(phase);
    updateParams({
      phase: phase === "all" ? null : phase,
      view: availModes.length > 1 ? defaultMode : null,
    });
  }

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filteredRequests = localRequests.filter((r) => {
    if (phaseFilter !== "all" && r.phase !== phaseFilter) return false;
    if (projectFilter && r.projectId !== projectFilter) return false;
    if (priorityFilter && r.priority !== priorityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !r.title.toLowerCase().includes(q) &&
        !r.description.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // ── Phase counts ────────────────────────────────────────────────────────────
  const phaseCounts: Record<PhaseFilter, number> = {
    all: localRequests.length,
    predesign: localRequests.filter((r) => r.phase === "predesign").length,
    design: localRequests.filter((r) => r.phase === "design").length,
    dev: localRequests.filter((r) => r.phase === "dev").length,
    track: localRequests.filter((r) => r.phase === "track").length,
  };

  // ── Available view modes ────────────────────────────────────────────────────
  const availableModes = getAvailableModes(phaseFilter);

  // ── Kanban drag-drop ────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const moveCard = useCallback(
    async (cardId: string, fromState: KanbanState, toState: KanbanState) => {
      if (fromState === toState) return;
      const prev = [...localRequests];

      setLocalRequests((reqs) =>
        reqs.map((r) =>
          r.id === cardId ? { ...r, kanbanState: toState } : r
        )
      );
      setError(null);

      try {
        const res = await fetch(`/api/requests/${cardId}/kanban`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: toState }),
        });
        if (!res.ok) {
          const data = await res.json();
          setLocalRequests(prev);
          setError(data.error ?? "Failed to move card");
        } else {
          router.refresh();
        }
      } catch {
        setLocalRequests(prev);
        setError("Network error");
      }
    },
    [localRequests, router]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const cardId = active.id as string;
    let toState = over.id as KanbanState;
    if (!KANBAN_STATES.includes(toState)) {
      for (const state of KANBAN_STATES) {
        const cards = filteredRequests.filter(
          (r) => (r.kanbanState ?? "todo") === state
        );
        if (cards.find((c) => c.id === (over.id as string))) {
          toState = state;
          break;
        }
      }
    }
    if (!KANBAN_STATES.includes(toState)) return;
    const fromReq = localRequests.find((r) => r.id === cardId);
    if (!fromReq) return;
    const fromState = (fromReq.kanbanState ?? "todo") as KanbanState;
    moveCard(cardId, fromState, toState);
  }

  // ── Filter chips ────────────────────────────────────────────────────────────
  const filterChips: FilterChip[] = [];
  if (projectFilter) {
    const proj = projectMap[projectFilter];
    filterChips.push({
      key: "project",
      label: "Project",
      value: proj?.name ?? projectFilter,
      rawValue: projectFilter,
    });
  }
  if (priorityFilter) {
    filterChips.push({
      key: "priority",
      label: "Priority",
      value: priorityFilter.toUpperCase(),
      rawValue: priorityFilter,
    });
  }

  const hasActiveFilters =
    phaseFilter !== "all" ||
    groupBy !== "none" ||
    !!projectFilter ||
    !!priorityFilter ||
    !!searchQuery;

  // ── Save view ───────────────────────────────────────────────────────────────
  async function handleSaveView(name: string) {
    try {
      await fetch("/api/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          filters: {
            phase: phaseFilter !== "all" ? [phaseFilter] : [],
            priority: priorityFilter ? [priorityFilter] : [],
            projectId: projectFilter ? [projectFilter] : [],
          },
          groupBy: groupBy !== "none" ? groupBy : null,
          viewMode,
        }),
      });
    } catch {
      // Non-critical: silently fail
    }
  }

  // ── Click a request → open dock ─────────────────────────────────────────────
  function openDock(requestId: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") params.set(k, v);
    }
    params.set("dock", requestId);
    router.push(`${pathname}?${params.toString()}`);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 52,
          padding: "0 20px",
          flexShrink: 0,
        }}
        className="border-b bg-card"
      >
        {/* Page title */}
        <span
          style={{
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            marginRight: 12,
            flexShrink: 0,
          }}
          className="text-foreground"
        >
          Requests
        </span>

        {/* Phase tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
          {PHASE_TABS.map((tab) => {
            const isActive = phaseFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handlePhaseChange(tab.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  height: 28,
                  padding: "0 10px",
                  border: "none",
                  borderRadius: 6,
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s",
                  background: isActive ? "hsl(var(--primary))" : "transparent",
                  color: isActive ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  whiteSpace: "nowrap",
                }}
                className={isActive ? "" : "hover:bg-accent"}
              >
                {tab.label}
                <span
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 9,
                    opacity: isActive ? 0.7 : 0.5,
                  }}
                >
                  {phaseCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right side controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 28,
              padding: "0 8px",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              background: "hsl(var(--muted))",
            }}
          >
            <Search size={11} className="text-muted-foreground/60" style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => updateParams({ q: e.target.value || null })}
              placeholder="Search…"
              style={{
                width: 120,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "'Geist Mono', monospace",
                fontSize: 11,
              }}
              className="text-foreground"
            />
          </div>

          <GroupByDropdown
            value={groupBy}
            onChange={(v) => updateParams({ group: v })}
          />

          <ViewModeToggle
            value={viewMode}
            onChange={(v) => updateParams({ view: v })}
            availableModes={availableModes}
          />

          <SaveViewButton
            hasActiveFilters={hasActiveFilters}
            onSave={handleSaveView}
          />

          {/* New request */}
          <button
            onClick={() => setShowNewForm(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              height: 28,
              padding: "0 10px",
              border: "none",
              borderRadius: 6,
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus size={12} />
            New
          </button>
        </div>
      </div>

      {/* ── Filter chips sub-bar ─────────────────────────────────────────── */}
      {filterChips.length > 0 && (
        <div
          style={{
            padding: "0 20px",
            flexShrink: 0,
          }}
          className="border-b bg-card"
        >
          <FilterChips
            chips={filterChips}
            onRemove={(key) => updateParams({ [key]: null })}
            onClearAll={() =>
              updateParams({ project: null, priority: null })
            }
          />
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {filteredRequests.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="No requests found"
            subtitle={
              hasActiveFilters
                ? "Try adjusting your filters."
                : "No requests yet. Create the first one."
            }
            cta={
              hasActiveFilters
                ? {
                    label: "Clear filters",
                    onClick: () =>
                      updateParams({
                        phase: null,
                        project: null,
                        priority: null,
                        q: null,
                        group: null,
                      }),
                  }
                : { label: "New request", onClick: () => setShowNewForm(true) }
            }
          />
        ) : viewMode === "kanban" && phaseFilter === "dev" ? (
          // ── Kanban view (dev phase only) ──────────────────────────────
          <KanbanContent
            requests={filteredRequests}
            projectMap={projectMap}
            assigneesByRequest={assigneesByRequest}
            focusedCardId={focusedCardId}
            onCardFocus={setFocusedCardId}
            onCardClick={(card) => openDock(card.id)}
            sensors={sensors}
            handleDragEnd={handleDragEnd}
          />
        ) : viewMode === "board" && phaseFilter === "design" ? (
          // ── Board view (design phase only) ───────────────────────────
          <BoardView
            requests={filteredRequests}
            columns={DESIGN_BOARD_COLUMNS}
            getColumnKey={(r) => r.designStage ?? "sense"}
            projectMap={projectMap}
            onRequestClick={(r) => openDock(r.id)}
          />
        ) : (
          // ── List view (default) ──────────────────────────────────────
          <ListView
            requests={filteredRequests}
            projectMap={projectMap}
            assigneesByRequest={assigneesByRequest}
            groupBy={groupBy}
            onRequestClick={(r) => openDock(r.id)}
          />
        )}
      </div>

      {/* ── Error toast ──────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "rgba(220,38,38,0.1)",
            border: "1px solid rgba(220,38,38,0.2)",
            color: "#f87171",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontFamily: "'Geist Mono', monospace",
            zIndex: 100,
          }}
        >
          {error}
        </div>
      )}

      {/* ── New request modal ─────────────────────────────────────────────── */}
      {showNewForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewForm(false);
          }}
        >
          <div
            style={{
              background: "hsl(var(--card))",
              borderRadius: 12,
              width: "100%",
              maxWidth: 600,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
            }}
          >
            <NewRequestForm
              onClose={() => {
                setShowNewForm(false);
                router.refresh();
              }}
              projects={projects.map((p) => ({
                id: p.id,
                name: p.name,
                color: p.color,
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban content sub-component ─────────────────────────────────────────────

interface KanbanContentProps {
  requests: Request[];
  projectMap: Record<string, { name: string; color: string }>;
  assigneesByRequest: Record<string, string[]>;
  focusedCardId: string | null;
  onCardFocus: (id: string) => void;
  onCardClick: (card: CardData) => void;
  sensors: ReturnType<typeof useSensors>;
  handleDragEnd: (event: DragEndEvent) => void;
}

function KanbanContent({
  requests,
  projectMap,
  assigneesByRequest,
  focusedCardId,
  onCardFocus,
  onCardClick,
  sensors,
  handleDragEnd,
}: KanbanContentProps) {
  const columns = Object.fromEntries(
    KANBAN_STATES.map((s) => [s, [] as CardData[]])
  ) as Record<KanbanState, CardData[]>;

  for (const r of requests) {
    const state = (r.kanbanState ?? "todo") as KanbanState;
    columns[state].push(toCardData(r, projectMap, assigneesByRequest));
  }

  function toCardData(
    r: Request,
    pm: Record<string, { name: string; color: string }>,
    ab: Record<string, string[]>
  ): CardData {
    const proj = r.projectId ? pm[r.projectId] : null;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      businessContext: r.businessContext ?? null,
      priority: r.priority ?? null,
      requestType: r.requestType ?? null,
      kanbanState: (r.kanbanState ?? "todo") as KanbanState,
      projectId: r.projectId ?? null,
      projectName: proj?.name ?? null,
      projectColor: proj?.color ?? null,
      assignees: ab[r.id] ?? [],
      deadlineAt: r.deadlineAt ? r.deadlineAt.toISOString() : null,
      figmaUrl: r.figmaUrl ?? null,
      figmaLockedAt: r.figmaLockedAt ? r.figmaLockedAt.toISOString() : null,
    };
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "16px 20px",
          height: "100%",
          alignItems: "flex-start",
          overflowX: "auto",
        }}
      >
        {KANBAN_STATES.map((state) => (
          <KanbanColumn
            key={state}
            state={state}
            label={KANBAN_STATE_LABELS[state]}
            cards={columns[state]}
            focusedCardId={focusedCardId}
            onCardClick={onCardClick}
            onCardFocus={onCardFocus}
          />
        ))}
      </div>
    </DndContext>
  );
}

// ── List view sub-component ──────────────────────────────────────────────────

type GroupableKey = "phase" | "stage" | "project" | "priority";

interface ListViewProps {
  requests: Request[];
  projectMap: Record<string, { name: string; color: string }>;
  assigneesByRequest: Record<string, string[]>;
  groupBy: GroupByOption;
  onRequestClick: (request: Request) => void;
}

function ListView({
  requests,
  projectMap,
  assigneesByRequest,
  groupBy,
  onRequestClick,
}: ListViewProps) {
  // When groupBy is "none", "assignee", or "cycle" we just render flat list
  // For phase/stage/project/priority we group
  const groupableKeys: GroupableKey[] = ["phase", "stage", "project", "priority"];
  const shouldGroup = groupableKeys.includes(groupBy as GroupableKey);

  if (!shouldGroup) {
    return (
      <div>
        <ListHeader />
        {requests.map((r) => (
          <ListRow
            key={r.id}
            request={r}
            projectMap={projectMap}
            assigneesByRequest={assigneesByRequest}
            onClick={() => onRequestClick(r)}
          />
        ))}
      </div>
    );
  }

  // Build groups
  const groups: Map<string, { label: string; requests: Request[] }> = new Map();

  for (const r of requests) {
    let key: string;
    let label: string;

    if (groupBy === "phase") {
      key = r.phase ?? "predesign";
      label = r.phase ? getPhaseLabel(r.phase) : "Predesign";
    } else if (groupBy === "stage") {
      key = getActiveStageLabel(r);
      label = key;
    } else if (groupBy === "project") {
      key = r.projectId ?? "__none__";
      label = r.projectId
        ? (projectMap[r.projectId]?.name ?? r.projectId)
        : "No Project";
    } else {
      // priority
      key = r.priority ?? "__none__";
      label = r.priority ? r.priority.toUpperCase() : "No Priority";
    }

    if (!groups.has(key)) {
      groups.set(key, { label, requests: [] });
    }
    groups.get(key)!.requests.push(r);
  }

  return (
    <div>
      {Array.from(groups.entries()).map(([key, group]) => (
        <div key={key}>
          {/* Group header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px 6px",
            }}
            className="border-b bg-muted"
          >
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
              className="text-muted-foreground"
            >
              {group.label}
            </span>
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
              }}
              className="text-muted-foreground/60"
            >
              {group.requests.length}
            </span>
          </div>
          <ListHeader />
          {group.requests.map((r) => (
            <ListRow
              key={r.id}
              request={r}
              projectMap={projectMap}
              assigneesByRequest={assigneesByRequest}
              onClick={() => onRequestClick(r)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ListHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 120px 140px 70px",
        gap: 12,
        padding: "6px 20px",
        }}
        className="border-b bg-muted"
    >
      {["ID", "REQUEST", "STAGE", "ASSIGNEE", "PRIORITY"].map((col) => (
        <span
          key={col}
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
          className="text-muted-foreground/60"
        >
          {col}
        </span>
      ))}
    </div>
  );
}

interface ListRowProps {
  request: Request;
  projectMap: Record<string, { name: string; color: string }>;
  assigneesByRequest: Record<string, string[]>;
  onClick: () => void;
}

function ListRow({ request: r, projectMap, assigneesByRequest, onClick }: ListRowProps) {
  const proj = r.projectId ? projectMap[r.projectId] : null;
  const assignees = assigneesByRequest[r.id] ?? [];
  const stageLabel = getActiveStageLabel(r);

  return (
    <button
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 120px 140px 70px",
        gap: 12,
        padding: "9px 20px",
        width: "100%",
        textAlign: "left",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
        alignItems: "center",
      }}
      className="border-b hover:bg-muted"
    >
      {/* ID */}
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        className="text-muted-foreground/60"
      >
        {r.id.slice(0, 8)}
      </span>

      {/* Title + project */}
      <div style={{ overflow: "hidden" }}>
        <div
          style={{
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          className="text-foreground"
        >
          {r.title}
        </div>
        {proj && (
          <div
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
            className="text-muted-foreground/60"
          >
            {proj.name}
          </div>
        )}
      </div>

      {/* Stage */}
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        className="text-muted-foreground"
      >
        {stageLabel}
      </span>

      {/* Assignee */}
      <span
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        className="text-muted-foreground"
      >
        {assignees[0] ?? "—"}
      </span>

      {/* Priority */}
      <div>
        <PriorityBadge priority={r.priority} />
      </div>
    </button>
  );
}
