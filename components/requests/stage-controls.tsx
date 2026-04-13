"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getStageLabel } from "@/lib/workflow";
import { Button } from "@/components/ui/button";

const STAGES = [
  "intake", "context", "shape", "bet",
  "explore", "validate", "handoff", "build", "impact",
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

  const currentIndex = STAGES.indexOf(currentStage as (typeof STAGES)[number]);
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
              key={stage}
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                isCurrent
                  ? isBlocked
                    ? "bg-accent-danger/20 text-accent-danger border border-accent-danger/30"
                    : "bg-accent-active/10 text-accent-active border border-accent-active/20"
                  : isCompleted
                  ? "text-muted-foreground/60 line-through"
                  : "text-muted-foreground/40"
              }`}
            >
              {getStageLabel(stage)}
            </span>
          );
        })}
      </div>

      {/* Advance button */}
      {nextStage && !isBlocked && (
        <Button
          variant="outline"
          onClick={handleAdvance}
          disabled={isPending}
          className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
        >
          {isPending ? "Moving..." : `→ Move to ${getStageLabel(nextStage)}`}
        </Button>
      )}

      {isLast && !isBlocked && (
        <p className="text-xs text-muted-foreground/60">Final stage reached</p>
      )}

      {/* Blocked toggle */}
      <Button
        variant="outline"
        onClick={handleToggleBlocked}
        disabled={isPending}
        className={`w-full justify-start text-xs ${
          isBlocked
            ? "text-accent-danger border-accent-danger/30 hover:border-accent-danger/50 bg-accent-danger/10"
            : "text-muted-foreground/60 hover:text-muted-foreground"
        }`}
      >
        {isPending ? "Updating..." : isBlocked ? "⊘ Unblock" : "⊘ Mark as blocked"}
      </Button>

      {/* Stall nudge */}
      {isStalled && !isBlocked && (
        <Button
          variant="outline"
          onClick={handleNudge}
          disabled={isPending || nudged}
          className="w-full justify-start text-xs border-accent-warning/20 bg-accent-warning/5 text-accent-warning/70 hover:text-accent-warning hover:border-accent-warning/40"
        >
          {nudged ? "✓ Nudge sent" : isPending ? "Sending…" : "🔔 Send nudge"}
        </Button>
      )}

      {error && <p className="text-xs text-accent-danger">{error}</p>}
    </div>
  );
}
