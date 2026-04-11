"use client";

import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

const ACTION_LABELS: Record<string, string> = {
  stage_changed: "moved to",
  comment_added: "commented",
  assigned: "assigned",
  figma_updated: "updated Figma file",
  ai_triage: "AI triage completed",
  created: "created this request",
  snoozed: "snoozed",
  resurfaced: "resurfaced from snooze",
  cycle_added: "added to cycle",
  initiative_added: "added to initiative",
  phase_changed: "moved to phase",
  validated: "signed off",
  iteration_added: "added an iteration",
};

const SYSTEM_ACTIONS = new Set([
  "ai_triage",
  "resurfaced",
]);

interface ActivityEntryData {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | Date;
}

export function ActivityEntry({ entry }: { entry: ActivityEntryData }) {
  const isSystem = !entry.actorId || SYSTEM_ACTIONS.has(entry.action);
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const actor = entry.actorName ?? "System";
  const ts =
    entry.createdAt instanceof Date
      ? entry.createdAt
      : new Date(entry.createdAt);

  return (
    <div className="flex items-start gap-3 px-1 py-2.5 border-b">
      {/* Dot indicator */}
      <div
        className={`size-1.5 shrink-0 mt-1.5 rounded-full ${isSystem ? "bg-muted-foreground/60" : "bg-primary"}`}
      />

      <div className="flex-1 min-w-0">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            {actor}
          </span>{" "}
          {label}
          {entry.newValue && (
            <>
              {" "}
              <Badge variant="secondary" className="font-mono text-[11px] h-auto py-0 px-1.5">
                {entry.newValue}
              </Badge>
            </>
          )}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground/60 mt-0.5">
          {formatDistanceToNow(ts, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
