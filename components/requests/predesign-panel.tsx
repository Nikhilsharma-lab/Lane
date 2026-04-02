"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = [
  { key: "intake",  label: "Intake",  desc: "Define the problem clearly" },
  { key: "context", label: "Context", desc: "Attach research & supporting data" },
  { key: "shape",   label: "Shape",   desc: "Define solution direction & appetite" },
  { key: "bet",     label: "Betting", desc: "Design Head decides: build, kill, or delay" },
] as const;

type PredesignStage = (typeof STAGES)[number]["key"];

interface Props {
  requestId: string;
  currentStage: PredesignStage;
  description: string | null;
  businessContext: string | null;
  successMetrics: string | null;
  profileRole: string;
}

export function PredesignPanel({
  requestId,
  currentStage,
  description,
  businessContext,
  successMetrics,
  profileRole,
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
    if (!nextStage) return;
    const previousStage = optimisticStage;
    setOptimisticStage(nextStage.key);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setOptimisticStage(previousStage);
        setError(data.error ?? "Failed to advance");
      } else {
        router.refresh();
      }
    } catch {
      setOptimisticStage(previousStage);
      setError("Network error");
    }
  }

  const { canAdvance, missing } = getGateStatus();
  const current = STAGES[currentIdx];
  const isFinal = !nextStage;

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Phase 1 — Predesign
        </span>
        <span className="text-xs text-zinc-600">PM + Org decides what to build</span>
      </div>

      {/* Stage stepper */}
      <div className="px-5 py-4 border-b border-zinc-800/50">
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
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                        : "bg-zinc-800/40 border-zinc-700/40 text-zinc-600"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span
                    className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center ${
                      isCurrent
                        ? "text-indigo-400"
                        : isDone
                        ? "text-green-500/80"
                        : "text-zinc-600"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div
                    className={`h-px w-full mb-5 mx-0.5 ${
                      i < optimisticIdx ? "bg-green-500/20" : "bg-zinc-800"
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
            <p className="text-xs font-semibold text-zinc-200 mb-0.5">{current.label}</p>
            <p className="text-xs text-zinc-500">{current.desc}</p>
          </div>
        )}

        {/* Gate status */}
        <div>
          {missing.length > 0 ? (
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-[11px] text-zinc-400">
                {isFinal ? "To approve the bet:" : `To advance to ${nextStage?.label}:`}
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
                {isFinal ? "Ready to approve — this starts the Design Phase" : `Ready to advance to ${nextStage?.label}`}
              </p>
            </div>
          )}
        </div>

        {/* Advance button — always shown, label changes at final betting stage */}
        <button
          onClick={handleAdvance}
          disabled={!canAdvance}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isFinal ? "Approve Bet — Start Design Phase" : `Advance to ${nextStage?.label}`}
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
