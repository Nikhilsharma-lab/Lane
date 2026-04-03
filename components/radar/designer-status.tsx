"use client";

import { useState } from "react";
import type { RadarDesigner } from "@/lib/radar";

function formatStaleness(ms: number | null): string {
  if (ms === null) return "";
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (mins < 5) return "just now";
  if (hours < 1) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  "in-flow": "🟢",
  idle: "🟡",
  stuck: "🔴",
  blocked: "🔴",
  "no-work": "⚪",
};

type ActionState = "idle" | "loading" | "done";

function DesignerCard({
  designer,
  canAct,
  avgDevQuestions,
}: {
  designer: RadarDesigner;
  canAct: boolean;
  avgDevQuestions: number;
}) {
  const [nudge, setNudge] = useState<ActionState>("idle");
  const [risk, setRisk] = useState<ActionState>("idle");

  async function handleNudge() {
    if (!designer.mostStalledRequestId || nudge !== "idle") return;
    setNudge("loading");
    try {
      const res = await fetch(`/api/requests/${designer.mostStalledRequestId}/nudge`, {
        method: "POST",
      });
      setNudge(res.ok ? "done" : "idle");
    } catch {
      setNudge("idle");
    }
  }

  async function handleMarkAtRisk() {
    if (!designer.mostStalledRequestId || risk !== "idle") return;
    setRisk("loading");
    try {
      const res = await fetch(`/api/requests/${designer.mostStalledRequestId}/toggle-blocked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStatus: designer.mostStalledRequestStatus }),
      });
      setRisk(res.ok ? "done" : "idle");
    } catch {
      setRisk("idle");
    }
  }

  const alreadyBlocked = designer.mostStalledRequestStatus === "blocked";

  return (
    <div className="flex items-start justify-between border border-[var(--border)] rounded-xl px-5 py-3">
      <div>
        <p className="text-sm text-[var(--text-primary)]">
          {STATUS_DOT[designer.status] ?? "⚪"} {designer.fullName}
        </p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          {designer.activeCount} active
          {designer.lastMovedMs !== null &&
            ` · last moved ${formatStaleness(designer.lastMovedMs)}`}
          {designer.status === "blocked" && designer.blockedTitle &&
            ` · BLOCKED · ${designer.blockedTitle}`}
        </p>
        {avgDevQuestions > 0 && (
          <p className={`text-[10px] mt-1 ${
            avgDevQuestions <= 1 ? "text-green-400"
            : avgDevQuestions <= 3 ? "text-yellow-400"
            : "text-red-400"
          }`}>
            {avgDevQuestions} avg dev {avgDevQuestions === 1 ? "question" : "questions"}/handoff (30d)
          </p>
        )}
      </div>
      {canAct && designer.mostStalledRequestId && (
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={handleNudge}
            disabled={nudge !== "idle"}
            className="text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {nudge === "loading" ? "…" : nudge === "done" ? "Sent ✓" : "Nudge"}
          </button>
          <button
            onClick={handleMarkAtRisk}
            disabled={risk !== "idle" || alreadyBlocked}
            className="text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {alreadyBlocked
              ? "Already blocked"
              : risk === "loading"
              ? "…"
              : risk === "done"
              ? "Marked ✓"
              : "Mark at-risk"}
          </button>
        </div>
      )}
    </div>
  );
}

export function DesignerStatus({
  designers,
  canActionMap,
  avgDevQuestionsMap,
}: {
  designers: RadarDesigner[];
  canActionMap: Record<string, boolean>;
  avgDevQuestionsMap: Record<string, number>;
}) {
  if (designers.length === 0) {
    return (
      <p className="text-sm text-zinc-600 border border-zinc-800/50 rounded-xl px-5 py-4">
        No designers in this org yet.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {designers.map((d) => (
        <DesignerCard
          key={d.id}
          designer={d}
          canAct={canActionMap[d.id] ?? false}
          avgDevQuestions={avgDevQuestionsMap[d.id] ?? 0}
        />
      ))}
    </div>
  );
}