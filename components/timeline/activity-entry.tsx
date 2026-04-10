"use client";

import { formatDistanceToNow } from "date-fns";

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
    <div
      className="flex items-start gap-3 px-1 py-2.5"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Dot indicator */}
      <div
        className="shrink-0 mt-1.5 rounded-full"
        style={{
          width: 6,
          height: 6,
          background: isSystem ? "var(--text-tertiary)" : "var(--accent)",
        }}
      />

      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {actor}
          </span>{" "}
          {label}
          {entry.newValue && (
            <>
              {" "}
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  background: "var(--bg-subtle)",
                  borderRadius: 4,
                  padding: "1px 5px",
                  color: "var(--text-primary)",
                }}
              >
                {entry.newValue}
              </span>
            </>
          )}
        </p>
        <p
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            color: "var(--text-tertiary)",
            marginTop: 2,
          }}
        >
          {formatDistanceToNow(ts, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
