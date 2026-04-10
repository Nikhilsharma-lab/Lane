"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppetiteBar } from "@/components/ui/appetite-bar";
import { updateCycleStatus, addRequestToCycle, removeRequestFromCycle } from "@/app/actions/cycles";

const statusStyles: Record<string, string> = {
  draft: "bg-[var(--bg-hover)] text-[var(--text-secondary)] border-[var(--border)]",
  active: "bg-green-500/10 text-green-600 border-green-500/20",
  completed: "bg-[#7DA5C4]/10 text-[#7DA5C4] border-[#7DA5C4]/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
};

const phaseColors: Record<string, string> = {
  predesign: "bg-[#D4A84B]/10 text-[#D4A84B] border-[#D4A84B]/20",
  design: "bg-[#A394C7]/10 text-[#A394C7] border-[#A394C7]/20",
  dev: "bg-[#7DA5C4]/10 text-[#7DA5C4] border-[#7DA5C4]/20",
  track: "bg-[#86A87A]/10 text-[#86A87A] border-[#86A87A]/20",
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
            <span className="text-xs text-[var(--text-tertiary)]">
              {projectName}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {cycle.name}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${statusStyles[cycle.status] ?? statusStyles.draft}`}
            >
              {cycle.status}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {cycle.appetiteWeeks} week appetite
            </span>
          </div>
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-2 shrink-0">
          {cycle.status === "draft" && (
            <button
              onClick={() => handleStatusChange("active")}
              disabled={isUpdating}
              className="text-xs px-3 py-1.5 rounded-lg border border-green-500/30 text-green-600 bg-green-500/5 hover:bg-green-500/10 transition-colors disabled:opacity-50"
            >
              Activate
            </button>
          )}
          {cycle.status === "active" && (
            <button
              onClick={() => handleStatusChange("completed")}
              disabled={isUpdating}
              className="text-xs px-3 py-1.5 rounded-lg border border-[#7DA5C4]/30 text-[#7DA5C4] bg-[#7DA5C4]/5 hover:bg-[#7DA5C4]/10 transition-colors disabled:opacity-50"
            >
              Complete
            </button>
          )}
          {(cycle.status === "draft" || cycle.status === "active") && (
            <button
              onClick={() => handleStatusChange("cancelled")}
              disabled={isUpdating}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 bg-red-500/5 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Appetite bar */}
      {cycle.startsAt && cycle.endsAt && (
        <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-surface)]">
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
        <div className="border border-[var(--border)] rounded-xl px-4 py-3">
          <p className="text-[10px] text-[var(--text-tertiary)] mb-0.5">
            Total
          </p>
          <p className="text-lg font-semibold text-[var(--text-primary)]">
            {cycleRequests.length}
          </p>
        </div>
        {(["predesign", "design", "dev", "track"] as const).map((phase) => {
          const cnt = phaseBreakdown[phase] ?? 0;
          if (cnt === 0) return null;
          return (
            <div
              key={phase}
              className="border border-[var(--border)] rounded-xl px-4 py-3"
            >
              <p className="text-[10px] text-[var(--text-tertiary)] mb-0.5 capitalize">
                {phase}
              </p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {cnt}
              </p>
            </div>
          );
        })}
      </div>

      {/* Request list */}
      <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-surface)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            Requests
          </h2>
          <button
            onClick={() => setShowAddRequest(!showAddRequest)}
            className="text-[11px] text-[var(--accent)] hover:underline"
          >
            {showAddRequest ? "Cancel" : "+ Add request"}
          </button>
        </div>

        {/* Add request search */}
        {showAddRequest && (
          <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <input
              type="text"
              placeholder="Search requests by title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
            {searchTerm && filteredOrgRequests.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {filteredOrgRequests.slice(0, 10).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleAddRequest(r.id)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors"
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            )}
            {searchTerm && filteredOrgRequests.length === 0 && (
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                No matching requests found
              </p>
            )}
          </div>
        )}

        {/* Request table */}
        {cycleRequests.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              No requests in this cycle yet.
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Add requests to start tracking appetite.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {cycleRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">
                    {r.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.phase && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${phaseColors[r.phase] ?? ""}`}
                    >
                      {r.phase}
                    </span>
                  )}
                  {r.priority && (
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                      {priorityLabels[r.priority] ?? r.priority}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveRequest(r.id)}
                    className="text-[10px] text-[var(--text-tertiary)] hover:text-red-500 transition-colors ml-1"
                    title="Remove from cycle"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
