"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);

export function StageControls({
  requestId,
  currentStage,
  currentStatus,
  updatedAt,
}: {
  requestId: string;
  currentStage: string;
  currentStatus: string;
  updatedAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nudged, setNudged] = useState(false);
  const isBlocked = currentStatus === "blocked";

  const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000;
  const isStalled = !STALL_EXEMPT.has(currentStatus) && daysSinceUpdate >= 5;

  const currentIndex = STAGES.findIndex((s) => s.id === currentStage);
  const isLast = currentIndex >= STAGES.length - 1;
  const nextStage = !isLast ? STAGES[currentIndex + 1] : null;

  function handleAdvance() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/requests/${requestId}/advance`, { method: "POST" });
      const data = await res.json();
      if (data.error) setError(data.error);
      else router.refresh();
    });
  }

  function handleNudge() {
    startTransition(async () => {
      const res = await fetch(`/api/requests/${requestId}/nudge`, { method: "POST" });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setNudged(true);
        router.refresh();
      }
    });
  }

  function handleToggleBlocked() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/requests/${requestId}/toggle-blocked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStatus }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else router.refresh();
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
                    : "bg-[#D4A84B]/10 text-[#D4A84B] border border-[#D4A84B]/20"
                  : isCompleted
                  ? "text-muted-foreground/60 line-through"
                  : "text-muted-foreground/40"
              }`}
            >
              {stage.label}
            </span>
          );
        })}
      </div>

      {/* Advance button */}
      {nextStage && !isBlocked && (
        <button
          onClick={handleAdvance}
          disabled={isPending}
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground border hover:border-border/80 rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
        >
          {isPending ? "Moving..." : `→ Move to ${nextStage.label}`}
        </button>
      )}

      {isLast && !isBlocked && (
        <p className="text-xs text-muted-foreground/60">Final stage reached</p>
      )}

      {/* Blocked toggle */}
      <button
        onClick={handleToggleBlocked}
        disabled={isPending}
        className={`w-full text-left text-xs border rounded-lg px-3 py-2 transition-colors disabled:opacity-40 ${
          isBlocked
            ? "text-red-400 border-red-500/30 hover:border-red-400/50 bg-red-500/10"
            : "text-muted-foreground/60 border hover:border-border/80 hover:text-muted-foreground"
        }`}
      >
        {isPending ? "Updating..." : isBlocked ? "⊘ Unblock" : "⊘ Mark as blocked"}
      </button>

      {/* Stall nudge */}
      {isStalled && !isBlocked && (
        <button
          onClick={handleNudge}
          disabled={isPending || nudged}
          className="w-full text-left text-xs border border-yellow-500/20 bg-yellow-500/5 text-yellow-500/70 hover:text-yellow-400 hover:border-yellow-500/40 rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
        >
          {nudged ? "✓ Nudge sent" : isPending ? "Sending…" : "🔔 Send nudge"}
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
