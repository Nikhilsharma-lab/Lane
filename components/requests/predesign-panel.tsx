"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PredictionConfidencePanel } from "@/components/requests/prediction-confidence-panel";
import { getStageLabel } from "@/lib/workflow";

const STAGES = [
  { key: "intake",  desc: "Define the problem clearly" },
  { key: "context", desc: "Attach research & supporting data" },
  { key: "shape",   desc: "Define solution direction & appetite" },
  { key: "bet",     desc: "Design Head decides: build, kill, or delay" },
] as const;

type PredesignStage = (typeof STAGES)[number]["key"];

interface Props {
  requestId: string;
  currentStage: PredesignStage;
  description: string | null;
  businessContext: string | null;
  successMetrics: string | null;
  profileRole: string;
  impactMetric: string | null;
  impactPrediction: string | null;
  existingConfidence: import("@/db/schema").PredictionConfidence | null;
}

export function PredesignPanel({
  requestId,
  currentStage,
  description,
  businessContext,
  successMetrics,
  profileRole,
  impactMetric,
  impactPrediction,
  existingConfidence,
}: Props) {
  const router = useRouter();
  const [optimisticStage, setOptimisticStage] = useState<PredesignStage>(currentStage);
  const [error, setError] = useState<string | null>(null);

  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
  const optimisticIdx = STAGES.findIndex((s) => s.key === optimisticStage);
  const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null;

  function getGateStatus(): { canAdvance: boolean; missing: string[] } {
    const missing: string[] = [];
    switch (currentStage) {
      case "intake":
        if (!description) missing.push("Problem description");
        if (!businessContext) missing.push("Business goal (Business Context field)");
        if (!successMetrics) missing.push("User impact (Success Metrics field)");
        break;
      case "context":
        if (!businessContext) missing.push("Context / research notes");
        break;
      case "shape":
        if (!successMetrics) missing.push("Constraints and time appetite");
        break;
      case "bet":
        if (profileRole !== "lead" && profileRole !== "admin")
          missing.push("Requires Design Head (lead/admin) role");
        break;
    }
    return { canAdvance: missing.length === 0, missing };
  }

  async function handleAdvance() {
    const previousStage = optimisticStage;
    if (nextStage) setOptimisticStage(nextStage.key);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        if (nextStage) setOptimisticStage(previousStage);
        setError(data.error ?? "Failed to advance");
      } else {
        router.refresh();
      }
    } catch {
      if (nextStage) setOptimisticStage(previousStage);
      setError("Network error");
    }
  }

  const { canAdvance, missing } = getGateStatus();
  const current = STAGES[currentIdx];
  const isFinal = !nextStage;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canAdvance) handleAdvance();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canAdvance]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b bg-muted flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Phase 1 — Predesign
        </span>
        <span className="text-xs text-muted-foreground/60">PM + Org decides what to build</span>
      </div>

      {/* Stage stepper */}
      <div className="px-5 py-4 border-b">
        <div className="flex items-start">
          {STAGES.map((s, i) => {
            const isDone = i < optimisticIdx;
            const isCurrent = s.key === optimisticStage;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono border transition-colors ${
                      isDone
                        ? "bg-green-500/15 border-green-500/30 text-green-400"
                        : isCurrent
                        ? "bg-[#D4A84B]/10 border-[#D4A84B]/20 text-[#D4A84B]"
                        : "bg-accent border text-muted-foreground/60"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span
                    className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center ${
                      isCurrent
                        ? "text-[#D4A84B]"
                        : isDone
                        ? "text-green-500/80"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {getStageLabel(s.key)}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div
                    className={`h-px w-full mb-5 mx-0.5 ${
                      i < optimisticIdx ? "bg-green-500/20" : "bg-accent"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current stage details */}
      <div className="px-5 py-4 space-y-4">
        {current && (
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">{getStageLabel(current.key)}</p>
            <p className="text-xs text-muted-foreground">{current.desc}</p>
          </div>
        )}

        {/* Prediction Confidence — shown at shape and bet stages when prediction is set */}
        {(optimisticStage === "shape" || optimisticStage === "bet") &&
          impactMetric &&
          impactPrediction && (
            <PredictionConfidencePanel
              requestId={requestId}
              existingConfidence={existingConfidence}
            />
          )}

        {/* Gate status */}
        <div>
          {missing.length > 0 ? (
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-[11px] text-muted-foreground">
                {isFinal ? "To approve the bet:" : `To advance to ${nextStage ? getStageLabel(nextStage.key) : ""}:`}
              </p>
              {missing.map((m, i) => (
                <p key={i} className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-400/60 shrink-0" />
                  {m}
                </p>
              ))}
            </div>
          ) : (
            <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-green-400 text-xs">✓</span>
              <p className="text-[11px] text-green-400/80">
                {isFinal ? "Ready to approve — this starts the Design Phase" : `Ready to advance to ${nextStage ? getStageLabel(nextStage.key) : ""}`}
              </p>
            </div>
          )}
        </div>

        {/* Advance button — always shown, label changes at final betting stage */}
        <button
          onClick={handleAdvance}
          disabled={!canAdvance}
          className="text-xs bg-accent hover:bg-border text-foreground px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isFinal ? "Approve Bet — Start Design Phase" : `Advance to ${nextStage ? getStageLabel(nextStage.key) : ""}`}
          <kbd className="hidden md:inline ml-2 text-[10px] border border-border/80 rounded px-1 py-0.5 font-mono opacity-60">
            ⌘↵
          </kbd>
        </button>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
