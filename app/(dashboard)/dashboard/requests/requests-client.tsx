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
import { Search, Plus, Share2, InboxIcon } from "lucide-react";
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
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { ShareDialog } from "@/components/published/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DESIGN_STAGES, getActiveStageLabel, getPhaseLabel } from "@/lib/workflow";
import type { Request, Project } from "@/db/schema";

// ── Types ────────────────────────────────────────────────────────────────────

type PhaseFilter = "all" | "predesign" | "design" | "dev" | "track";

// ── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <Badge
      variant="outline"
      className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] shrink-0 rounded px-1.5 py-px"
      style={{
        background: `var(--priority-${priority}-bg)`,
        color: `var(--priority-${priority}-text)`,
        borderColor: "transparent",
      }}
    >
      {priority.toUpperCase()}
    </Badge>
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
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalRequests(initialRequests);
  }, [initialRequests]);

  // ── URL update helper ───────────────────────────────────────────────────────
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(searchParams)) {
        if (typeof v === "string") params.set(k, v);
      }
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 h-12 px-5 shrink-0 border-b">
        <h1 className="text-sm font-semibold tracking-tight shrink-0">
          Requests
        </h1>

        <Separator orientation="vertical" className="h-4" />

        {/* Phase tabs — shadcn line variant */}
        <Tabs value={phaseFilter} className="flex-1">
          <TabsList variant="line" size="sm" className="border-b-0">
            {PHASE_TABS.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                onClick={() => handlePhaseChange(tab.key)}
              >
                {tab.label}
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px] font-mono">
                  {phaseCounts[tab.key]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Right side controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => updateParams({ q: e.target.value || null })}
              placeholder="Search..."
              className="h-7 w-[160px] pl-7 text-xs"
            />
          </div>

          <ProjectSwitcher projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))} />

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

          <Button
            variant="outline"
            onClick={() => setShowShareDialog(true)}
          >
            <Share2 className="size-3.5" />
            Share
          </Button>

          <Button
            onClick={() => setShowNewForm(true)}
          >
            <Plus className="size-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* ── Filter chips sub-bar ─────────────────────────────────────────── */}
      {filterChips.length > 0 && (
        <div className="px-5 shrink-0 border-b bg-card">
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
      <div className="flex-1 overflow-auto">
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
          <BoardView
            requests={filteredRequests}
            columns={DESIGN_BOARD_COLUMNS}
            getColumnKey={(r) => r.designStage ?? "sense"}
            projectMap={projectMap}
            onRequestClick={(r) => openDock(r.id)}
          />
        ) : (
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
        <div className="fixed bottom-5 right-5 rounded-lg px-3.5 py-2 text-xs font-mono z-[100] bg-accent-danger/10 border border-accent-danger/20 text-accent-danger">
          {error}
        </div>
      )}

      {/* ── New request modal ─────────────────────────────────────────────── */}
      {showNewForm && (
        <div
          className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewForm(false);
          }}
        >
          <div className="bg-card rounded-xl w-full max-w-[600px] max-h-[90vh] overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.16)]">
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

      {/* ── Share / publish dialog ────────────────────────────────────────── */}
      {showShareDialog && (
        <ShareDialog
          viewType="requests"
          currentFilters={{
            phase: phaseFilter !== "all" ? [phaseFilter] : [],
            priority: priorityFilter ? [priorityFilter] : [],
            projectId: projectFilter ? [projectFilter] : [],
          }}
          onClose={() => setShowShareDialog(false)}
        />
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 px-5 py-4 h-full items-start overflow-x-auto">
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
  const groupableKeys: GroupableKey[] = ["phase", "stage", "project", "priority"];
  const shouldGroup = groupableKeys.includes(groupBy as GroupableKey);

  function renderTable(rows: Request[]) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px] text-xs text-muted-foreground">ID</TableHead>
            <TableHead className="text-xs text-muted-foreground">Request</TableHead>
            <TableHead className="w-[120px] text-xs text-muted-foreground">Stage</TableHead>
            <TableHead className="w-[140px] text-xs text-muted-foreground">Assignee</TableHead>
            <TableHead className="w-[80px] text-xs text-muted-foreground">Priority</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const proj = r.projectId ? projectMap[r.projectId] : null;
            const assignees = assigneesByRequest[r.id] ?? [];
            const stageLabel = getActiveStageLabel(r);
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => onRequestClick(r)}
              >
                <TableCell className="font-mono text-[11px] text-muted-foreground/60">
                  {r.id.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground truncate">
                    {r.title}
                  </div>
                  {proj && (
                    <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                      {proj.name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">
                  {stageLabel}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {assignees[0] ?? "\u2014"}
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={r.priority} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  if (!shouldGroup) {
    return <div className="px-4">{renderTable(requests)}</div>;
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
      key = r.priority ?? "__none__";
      label = r.priority ? r.priority.toUpperCase() : "No Priority";
    }

    if (!groups.has(key)) {
      groups.set(key, { label, requests: [] });
    }
    groups.get(key)!.requests.push(r);
  }

  return (
    <div className="px-4 space-y-6 py-4">
      {Array.from(groups.entries()).map(([key, group]) => (
        <div key={key}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </span>
            <Badge variant="secondary" className="text-[10px] font-mono">
              {group.requests.length}
            </Badge>
          </div>
          {renderTable(group.requests)}
        </div>
      ))}
    </div>
  );
}
