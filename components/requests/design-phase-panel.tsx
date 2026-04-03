"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ValidationGate } from "./validation-gate";

const STAGES = [
  { key: "explore",  label: "Explore",  desc: "Designer creates concepts in Figma" },
  { key: "validate", label: "Validate", desc: "3 sign-offs: Designer · PM · Design Head" },
  { key: "handoff",  label: "Handoff",  desc: "Figma locked, sent to dev" },
] as const;

type DesignStage = (typeof STAGES)[number]["key"];

interface Props {
  requestId: string;
  currentDesignStage: DesignStage;
  figmaUrl: string | null;
  profileRole: string;
  isTestUser?: boolean;
}

export function DesignPhasePanel({ requestId, currentDesignStage, figmaUrl, profileRole, isTestUser = false }: Props) {
  const router = useRouter();
  const [optimisticStage, setOptimisticStage] = useState<DesignStage>(currentDesignStage);
  const [error, setError] = useState<string | null>(null);

  const currentIdx = STAGES.findIndex((s) => s.key === currentDesignStage);
  const optimisticIdx = STAGES.findIndex((s) => s.key === optimisticStage);
  const current = STAGES[currentIdx];
  const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null;
  const isLastDesign = currentIdx >= STAGES.length - 1;
  const isValidateStage = currentDesignStage === "validate";

  function getGateStatus(): { canAdvance: boolean; missing: string[] } {
    const missing: string[] = [];
    if (currentDesignStage === "handoff" && !figmaUrl) {
      missing.push("Add a Figma URL before handing off to dev");
    }
    return { canAdvance: missing.length === 0, missing };
  }

  async function handleAdvance() {
    if (!nextStage) return;
    const previousStage = optimisticStage;
    setOptimisticStage(nextStage.key);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, { method: "POST" });
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
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Phase 2 — Design
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">Designer leads</span>
      </div>

      {/* Stage stepper */}
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-start">
          {STAGES.map((s, i) => {
            const isDone = i < optimisticIdx;
            const isCurrent = s.key === optimisticStage;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono border transition-colors ${
                    isDone
                      ? "bg-green-500/15 border-green-500/30 text-green-400"
                      : isCurrent
                      ? "bg-[#D4A84B]/10 border-[#D4A84B]/20 text-[#D4A84B]"
                      : "bg-[var(--bg-hover)] border-[var(--border)] text-[var(--text-tertiary)]"
                  }`}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center ${
                    isCurrent ? "text-[#D4A84B]" : isDone ? "text-green-500/80" : "text-[var(--text-tertiary)]"
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`h-px w-full mb-5 mx-0.5 ${i < optimisticIdx ? "bg-green-500/20" : "bg-[var(--bg-hover)]"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current stage content */}
      <div className="px-5 py-4 space-y-4">
        {current && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)] mb-0.5">{current.label}</p>
            <p className="text-xs text-[var(--text-secondary)]">{current.desc}</p>
          </div>
        )}

        {/* Validate stage: show ValidationGate instead of advance button */}
        {isValidateStage ? (
          <ValidationGate requestId={requestId} myProfileRole={profileRole} isTestUser={isTestUser} />
        ) : (
          <>
            {/* Gate status for explore + handoff */}
            <div>
              {missing.length > 0 ? (
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2.5 space-y-1">
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {isLastDesign ? "To hand off to dev:" : `To advance to ${nextStage?.label}:`}
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
                    {isLastDesign ? "Ready to hand off to dev" : `Ready to advance to ${nextStage?.label}`}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleAdvance}
              disabled={!canAdvance}
              className="text-xs bg-[var(--bg-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLastDesign ? "Hand off to Dev" : `Advance to ${nextStage?.label}`}
              <kbd className="hidden md:inline ml-2 text-[10px] border border-[var(--border-strong)] rounded px-1 py-0.5 font-mono opacity-60">
                ⌘↵
              </kbd>
            </button>
          </>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </div>
  );
}
