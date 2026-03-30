"use client";

import { useState, useTransition } from "react";
import { advanceStage } from "@/app/actions/requests";

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
}: {
  requestId: string;
  currentStage: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
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

      {/* Advance button */}
      {nextStage && (
        <button
          onClick={handleAdvance}
          disabled={isPending}
          className="w-full text-left text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
        >
          {isPending ? "Moving..." : `→ Move to ${nextStage.label}`}
        </button>
      )}

      {isLast && (
        <p className="text-xs text-zinc-700">Final stage reached</p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
