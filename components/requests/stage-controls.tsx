"use client";

import { useState, useTransition } from "react";
import { advanceStage, toggleBlocked } from "@/app/actions/requests";

const STAGES = [
  { id: "intake", label: "Intake" },
  { id: "context", label: "Context" },
  { id: "shape", label: "Shape" },
  { id: "bet", label: "Bet" },
  { id: "explore", label: "Explore" },
  { id: "validate", label: "Validate" },
  { id: "handoff", label: "Handoff" },
  { id: "build", label: "Build" },
  { id: "impact", label: "Impact" },
] as const;

export function StageControls({
  requestId,
  currentStage,
  currentStatus,
}: {
  requestId: string;
  currentStage: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isBlocked = currentStatus === "blocked";

  const currentIndex = STAGES.findIndex((s) => s.id === currentStage);
  const isLast = currentIndex >= STAGES.length - 1;
  const nextStage = !isLast ? STAGES[currentIndex + 1] : null;

  function handleAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceStage(requestId);
      if (result?.error) setError(result.error);
    });
  }

  function handleToggleBlocked() {
    setError(null);
    startTransition(async () => {
      const result = await toggleBlocked(requestId, currentStatus);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {/* Stage pipeline */}
      <div className="flex flex-wrap gap-1">
        {STAGES.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <span
              key={stage.id}
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                isCurrent
                  ? isBlocked
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : isCompleted
                  ? "text-zinc-600 line-through"
                  : "text-zinc-800"
              }`}
            >
              {stage.label}
            </span>
          );
        })}
      </div>

      {/* Advance button — hidden when blocked */}
      {nextStage && !isBlocked && (
        <button
          onClick={handleAdvance}
          disabled={isPending}
          className="w-full text-left text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
        >
          {isPending ? "Moving..." : `→ Move to ${nextStage.label}`}
        </button>
      )}

      {isLast && !isBlocked && (
        <p className="text-xs text-zinc-700">Final stage reached</p>
      )}

      {/* Blocked toggle */}
      <button
        onClick={handleToggleBlocked}
        disabled={isPending}
        className={`w-full text-left text-xs border rounded-lg px-3 py-2 transition-colors disabled:opacity-40 ${
          isBlocked
            ? "text-red-400 border-red-500/30 hover:border-red-400/50 bg-red-500/10"
            : "text-zinc-600 border-zinc-800 hover:border-zinc-700 hover:text-zinc-400"
        }`}
      >
        {isPending ? "Updating..." : isBlocked ? "⊘ Unblock" : "⊘ Mark as blocked"}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
