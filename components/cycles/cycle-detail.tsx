"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppetiteBar } from "@/components/shared/appetite-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateCycleStatus, addRequestToCycle, removeRequestFromCycle } from "@/app/actions/cycles";
import { PHASE_BADGE } from "@/lib/theme-colors";

const statusStyles: Record<string, string> = {
  draft: "bg-accent text-muted-foreground border",
  active: "bg-accent-success/10 text-accent-success border-accent-success/20",
  completed: "bg-[var(--phase-dev)]/10 text-[var(--phase-dev)] border-[var(--phase-dev)]/20",
  cancelled: "bg-accent-danger/10 text-accent-danger border-accent-danger/20",
};

const priorityLabels: Record<string, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

interface CycleRequest {
  id: string;
  title: string;
  phase: string | null;
  priority: string | null;
  kanbanState: string | null;
  trackStage: string | null;
}

interface CycleDetailProps {
  cycle: {
    id: string;
    name: string;
    status: string;
    appetiteWeeks: number;
    startsAt: string | Date | null;
    endsAt: string | Date | null;
  };
  projectName: string;
  projectColor: string;
  requests: CycleRequest[];
  completedCount: number;
  orgRequests: { id: string; title: string }[];
}

export function CycleDetail({
  cycle,
  projectName,
  projectColor,
  requests: cycleRequests,
  completedCount,
  orgRequests,
}: CycleDetailProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const phaseBreakdown: Record<string, number> = {};
  for (const r of cycleRequests) {
    const phase = r.phase ?? "predesign";
    phaseBreakdown[phase] = (phaseBreakdown[phase] ?? 0) + 1;
  }

  async function handleStatusChange(newStatus: "draft" | "active" | "completed" | "cancelled") {
    setIsUpdating(true);
    const result = await updateCycleStatus(cycle.id, newStatus);
    if (result.error) {
      alert(result.error);
    }
    setIsUpdating(false);
    router.refresh();
  }

  async function handleAddRequest(requestId: string) {
    const result = await addRequestToCycle(cycle.id, requestId);
    if (result.error) {
      alert(result.error);
    }
    setShowAddRequest(false);
    setSearchTerm("");
    router.refresh();
  }

  async function handleRemoveRequest(requestId: string) {
    const result = await removeRequestFromCycle(cycle.id, requestId);
    if (result.error) {
      alert(result.error);
    }
    router.refresh();
  }

  const cycleRequestIds = new Set(cycleRequests.map((r) => r.id));
  const filteredOrgRequests = orgRequests.filter(
    (r) =>
      !cycleRequestIds.has(r.id) &&
      r.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ background: projectColor }}
            />
            <span className="text-xs text-muted-foreground/60">
              {projectName}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {cycle.name}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${statusStyles[cycle.status] ?? statusStyles.draft}`}
            >
              {cycle.status}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {cycle.appetiteWeeks} week appetite
            </span>
          </div>
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-2 shrink-0">
          {cycle.status === "draft" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange("active")}
              disabled={isUpdating}
              className="border-accent-success/30 text-accent-success bg-accent-success/5 hover:bg-accent-success/10"
            >
              Activate
            </Button>
          )}
          {cycle.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange("completed")}
              disabled={isUpdating}
            >
              Complete
            </Button>
          )}
          {(cycle.status === "draft" || cycle.status === "active") && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleStatusChange("cancelled")}
              disabled={isUpdating}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Appetite bar */}
      {cycle.startsAt && cycle.endsAt && (
        <div className="border border rounded-xl p-4 bg-card">
          <AppetiteBar
            appetiteWeeks={cycle.appetiteWeeks}
            startsAt={cycle.startsAt}
            endsAt={cycle.endsAt}
            completedCount={completedCount}
            totalCount={cycleRequests.length}
          />
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border rounded-xl px-4 py-3">
          <p className="text-[10px] text-muted-foreground/60 mb-0.5">
            Total
          </p>
          <p className="text-lg font-semibold text-foreground">
            {cycleRequests.length}
          </p>
        </div>
        {(["predesign", "design", "dev", "track"] as const).map((phase) => {
          const cnt = phaseBreakdown[phase] ?? 0;
          if (cnt === 0) return null;
          return (
            <div
              key={phase}
              className="border border rounded-xl px-4 py-3"
            >
              <p className="text-[10px] text-muted-foreground/60 mb-0.5 capitalize">
                {phase}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {cnt}
              </p>
            </div>
          );
        })}
      </div>

      {/* Request list */}
      <div className="border border rounded-xl bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Requests
          </h2>
          <Button
            variant="link"
            size="xs"
            onClick={() => setShowAddRequest(!showAddRequest)}
          >
            {showAddRequest ? "Cancel" : "+ Add request"}
          </Button>
        </div>

        {/* Add request search */}
        {showAddRequest && (
          <div className="px-4 py-3 border-b border bg-muted">
            <Input
              type="text"
              placeholder="Search requests by title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && filteredOrgRequests.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {filteredOrgRequests.slice(0, 10).map((r) => (
                  <Button
                    key={r.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddRequest(r.id)}
                    className="w-full justify-start"
                  >
                    {r.title}
                  </Button>
                ))}
              </div>
            )}
            {searchTerm && filteredOrgRequests.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground/60">
                No matching requests found
              </p>
            )}
          </div>
        )}

        {/* Request table */}
        {cycleRequests.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No requests in this cycle yet.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add requests to start tracking appetite.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cycleRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {r.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.phase && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${PHASE_BADGE[r.phase] ?? ""}`}
                    >
                      {r.phase}
                    </span>
                  )}
                  {r.priority && (
                    <span className="text-[10px] font-mono text-muted-foreground/60">
                      {priorityLabels[r.priority] ?? r.priority}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemoveRequest(r.id)}
                    title="Remove from cycle"
                    className="text-muted-foreground/60 hover:text-destructive ml-1"
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
