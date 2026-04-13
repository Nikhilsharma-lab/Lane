"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateInitiative,
  addRequestToInitiative,
  removeRequestFromInitiative,
} from "@/app/actions/initiatives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PHASE_BADGE } from "@/lib/theme-colors";

const statusStyles: Record<string, string> = {
  active: "bg-accent-success/10 text-accent-success border-accent-success/20",
  completed: "bg-phase-dev/10 text-phase-dev border-phase-dev/20",
  archived: "bg-accent text-muted-foreground/60 border",
};

interface InitiativeRequest {
  id: string;
  title: string;
  phase: string | null;
  priority: string | null;
}

interface InitiativeDetailProps {
  initiative: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    status: string;
  };
  requests: InitiativeRequest[];
  orgRequests: { id: string; title: string }[];
}

export function InitiativeDetail({
  initiative,
  requests: initRequests,
  orgRequests,
}: InitiativeDetailProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  async function handleStatusChange(
    newStatus: "active" | "completed" | "archived"
  ) {
    setIsUpdating(true);
    const result = await updateInitiative(initiative.id, {
      status: newStatus,
    });
    if (result.error) {
      alert(result.error);
    }
    setIsUpdating(false);
    router.refresh();
  }

  async function handleAddRequest(requestId: string) {
    const result = await addRequestToInitiative(initiative.id, requestId);
    if (result.error) {
      alert(result.error);
    }
    setShowAddRequest(false);
    setSearchTerm("");
    router.refresh();
  }

  async function handleRemoveRequest(requestId: string) {
    const result = await removeRequestFromInitiative(
      initiative.id,
      requestId
    );
    if (result.error) {
      alert(result.error);
    }
    router.refresh();
  }

  const initRequestIds = new Set(initRequests.map((r) => r.id));
  const filteredOrgRequests = orgRequests.filter(
    (r) =>
      !initRequestIds.has(r.id) &&
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
              style={{ background: initiative.color }}
            />
            <h1 className="text-xl font-semibold text-foreground">
              {initiative.name}
            </h1>
          </div>
          {initiative.description && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              {initiative.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${statusStyles[initiative.status] ?? statusStyles.active}`}
            >
              {initiative.status}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {initRequests.length} request
              {initRequests.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-2 shrink-0">
          {initiative.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange("completed")}
              disabled={isUpdating}
              className="border-phase-dev/30 text-phase-dev bg-phase-dev/5 hover:bg-phase-dev/10"
            >
              Complete
            </Button>
          )}
          {initiative.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange("archived")}
              disabled={isUpdating}
            >
              Archive
            </Button>
          )}
          {initiative.status !== "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange("active")}
              disabled={isUpdating}
              className="border-accent-success/30 text-accent-success bg-accent-success/5 hover:bg-accent-success/10"
            >
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* Request list */}
      <div className="border border rounded-xl bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Requests
          </h2>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowAddRequest(!showAddRequest)}
            className="text-primary hover:underline"
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
              inputSize="lg"
            />
            {searchTerm && filteredOrgRequests.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {filteredOrgRequests.slice(0, 10).map((r) => (
                  <Button
                    key={r.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddRequest(r.id)}
                    className="w-full justify-start text-left"
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
        {initRequests.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No requests in this initiative yet.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Group related requests across projects to track cross-cutting
              work.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {initRequests.map((r) => (
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
                      {r.priority.toUpperCase()}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemoveRequest(r.id)}
                    className="text-muted-foreground/60 hover:text-accent-danger ml-1"
                    title="Remove from initiative"
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
