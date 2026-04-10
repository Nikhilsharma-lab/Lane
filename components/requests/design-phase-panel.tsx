"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ValidationGate } from "./validation-gate";
import { IterationCard } from "@/components/iterations/iteration-card";
import { createIteration, getIterationsForRequest } from "@/app/actions/iterations";
import { Plus } from "lucide-react";
import type { Iteration } from "@/db/schema";

const STAGES = [
  { key: "sense",    label: "Sense",    desc: "Understand the problem deeply before proposing anything" },
  { key: "frame",    label: "Frame",    desc: "Define what problem is actually being solved" },
  { key: "diverge",  label: "Diverge",  desc: "Generate multiple solution directions" },
  { key: "converge", label: "Converge", desc: "Narrow to a refined solution through critique" },
  { key: "prove",    label: "Prove",    desc: "3 sign-offs: Designer · PM · Design Head" },
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

  // Iterations state
  const [iterationsList, setIterationsList] = useState<Iteration[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newFigmaUrl, setNewFigmaUrl] = useState("");
  const [addingIteration, setAddingIteration] = useState(false);
  const showIterations = currentDesignStage === "diverge" || currentDesignStage === "converge";

  const fetchIterations = useCallback(async () => {
    if (!showIterations) return;
    try {
      const data = await getIterationsForRequest(requestId);
      setIterationsList(data);
    } catch { /* silently fail */ }
  }, [requestId, showIterations]);

  useEffect(() => { fetchIterations(); }, [fetchIterations]);

  async function handleAddIteration(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || addingIteration) return;
    setAddingIteration(true);
    await createIteration({
      requestId,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      figmaUrl: newFigmaUrl.trim() || undefined,
      stage: currentDesignStage,
    });
    setNewTitle("");
    setNewDesc("");
    setNewFigmaUrl("");
    setShowAddForm(false);
    setAddingIteration(false);
    fetchIterations();
  }

  const currentIdx = STAGES.findIndex((s) => s.key === currentDesignStage);
  const optimisticIdx = STAGES.findIndex((s) => s.key === optimisticStage);
  const current = STAGES[currentIdx];
  const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null;
  const isLastDesign = currentIdx >= STAGES.length - 1;
  const isProveStage = currentDesignStage === "prove";

  function getGateStatus(): { canAdvance: boolean; missing: string[] } {
    const missing: string[] = [];
    if (currentDesignStage === "prove" && !figmaUrl) {
      missing.push("Add a Figma URL before handing off to dev");
    }
    return { canAdvance: missing.length === 0, missing };
  }

  async function handleAdvance() {
    const previousStage = optimisticStage;
    if (nextStage) setOptimisticStage(nextStage.key);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, { method: "POST" });
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

        {/* Prove stage: show ValidationGate instead of advance button */}
        {isProveStage ? (
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

      {/* Iterations section — shown during diverge & converge */}
      {showIterations && (
        <div className="px-5 py-4 border-t border-[var(--border)] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Iterations{iterationsList.length > 0 ? ` (${iterationsList.length})` : ""}
            </p>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-medium transition-colors"
              style={{
                color: "var(--accent)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Plus size={12} />
              Add Direction
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <form onSubmit={handleAddIteration} className="space-y-2 p-3 rounded-lg" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Direction title"
                className="w-full rounded-md px-2.5 py-1.5"
                style={{ fontSize: 12, background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }}
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full rounded-md px-2.5 py-1.5 resize-none"
                style={{ fontSize: 12, background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }}
              />
              <input
                type="url"
                value={newFigmaUrl}
                onChange={(e) => setNewFigmaUrl(e.target.value)}
                placeholder="Figma URL (optional)"
                className="w-full rounded-md px-2.5 py-1.5"
                style={{ fontSize: 12, background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-[11px] px-2.5 py-1 rounded-md transition-colors"
                  style={{ color: "var(--text-secondary)", background: "none", border: "1px solid var(--border)", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingIteration || !newTitle.trim()}
                  className="text-[11px] px-2.5 py-1 rounded-md transition-opacity disabled:opacity-40"
                  style={{ fontWeight: 500, color: "#fff", background: "var(--accent)", border: "none", cursor: "pointer" }}
                >
                  {addingIteration ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          )}

          {/* Iteration list */}
          {iterationsList.length === 0 && !showAddForm && (
            <p className="text-[11px] text-[var(--text-tertiary)] py-2">
              {currentDesignStage === "diverge"
                ? "Start exploring directions. There's no wrong answer yet."
                : "Narrow down your directions. Log what you chose and why."}
            </p>
          )}

          {iterationsList.length > 0 && (
            <div className="space-y-2">
              {iterationsList.map((iter) => (
                <IterationCard key={iter.id} iteration={iter} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
