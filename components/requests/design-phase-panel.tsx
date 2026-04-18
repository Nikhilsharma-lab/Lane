"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ProveGate } from "./prove-gate";
import { IterationCard } from "@/components/iterations/iteration-card";
import { createIteration, getIterationsForRequest } from "@/app/actions/iterations";
import { Plus } from "lucide-react";
import type { Iteration } from "@/db/schema";
import { getStageLabel } from "@/lib/workflow";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { PanelHeader } from "@/components/ui/panel-header";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProveFirstTimeModal } from "./prove-first-time-modal";
import { getSeenHints } from "@/app/actions/get-seen-hints";
import { SensePanel } from "./sense-panel";
import { FramePanel } from "./frame-panel";

const STAGES = [
  { key: "sense",    desc: "Deep understanding before proposing anything. Related research, past decisions, nothing rushed." },
  { key: "frame",    desc: "Define what problem is actually being solved. Success criteria, constraints, open questions." },
  { key: "diverge",  desc: "Generate multiple solution directions. Breadth over depth. 2-5+ iterations." },
  { key: "converge", desc: "Narrow to a refined solution through critique and iteration." },
  { key: "prove",    desc: "Three-sign-off validation before handoff: designer, PM, design lead." },
] as const;

type DesignStage = (typeof STAGES)[number]["key"];

interface Props {
  requestId: string;
  currentDesignStage: DesignStage;
  figmaUrl: string | null;
  profileRole: string;
  isTestUser?: boolean;
  requestData?: {
    sensingSummary: string | null;
    designFrameProblem: string | null;
    designFrameSuccessCriteria: string | null;
    designFrameConstraints: string | null;
    designFrameDivergence: string | null;
    description: string | null;
  };
}

export function DesignPhasePanel({ requestId, currentDesignStage, figmaUrl, profileRole, isTestUser = false, requestData }: Props) {
  const router = useRouter();
  const [optimisticStage, setOptimisticStage] = useState<DesignStage>(currentDesignStage);
  const [error, setError] = useState<string | null>(null);

  // Progressive-disclosure state for the first-time Prove modal.
  // null while fetching on mount; treats every flag as unseen during that window.
  const [seenHints, setSeenHints] = useState<Record<string, boolean> | null>(null);
  const [showProveModal, setShowProveModal] = useState(false);

  useEffect(() => {
    getSeenHints()
      .then(setSeenHints)
      .catch(() => setSeenHints({}));
  }, []);

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
    } catch (err) { console.error("[design-phase-panel] fetch iterations failed:", err); }
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

  async function doAdvance() {
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

  async function handleAdvance() {
    // First-time teaching: intercept Converge → Prove with the modal.
    // If seenHints is still null (fetch in flight), we do NOT intercept —
    // better to let the advance through than block on a slow read.
    if (
      currentDesignStage === "converge" &&
      nextStage?.key === "prove" &&
      seenHints !== null &&
      !seenHints.prove_modal
    ) {
      setShowProveModal(true);
      return;
    }
    await doAdvance();
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
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <PanelHeader>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Phase 2 — Design
        </span>
        <span className="text-xs text-muted-foreground/60">Designer leads</span>
      </PanelHeader>

      {/* Stage stepper (hover for stage description) */}
      <TooltipProvider delay={150}>
        <div className="px-5 py-4 border-b">
          <div className="flex items-start">
            {STAGES.map((s, i) => {
              const isDone = i < optimisticIdx;
              const isCurrent = s.key === optimisticStage;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <div
                          className="flex flex-col items-center flex-1 cursor-default rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                          tabIndex={0}
                          aria-label={`${getStageLabel(s.key)}: ${s.desc}`}
                        />
                      }
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono border transition-colors ${
                        isDone
                          ? "bg-accent-success/15 border-accent-success/30 text-accent-success"
                          : isCurrent
                          ? "bg-accent-active/10 border-accent-active/20 text-accent-active"
                          : "bg-accent border text-muted-foreground/60"
                      }`}>
                        {isDone ? "✓" : i + 1}
                      </div>
                      <span className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center ${
                        isCurrent ? "text-accent-active" : isDone ? "text-accent-success/80" : "text-muted-foreground/60"
                      }`}>
                        {getStageLabel(s.key)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" size="sm">
                      {s.desc}
                    </TooltipContent>
                  </Tooltip>
                  {i < STAGES.length - 1 && (
                    <div className={`h-px w-full mb-5 mx-0.5 ${i < optimisticIdx ? "bg-accent-success/20" : "bg-accent"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </TooltipProvider>

      {/* Current stage content */}
      <div className="px-5 py-4 space-y-4">
        {current && currentDesignStage === "sense" && (
          <SensePanel
            requestId={requestId}
            initialSummary={requestData?.sensingSummary ?? null}
          />
        )}

        {current && currentDesignStage === "frame" && (
          <FramePanel
            requestId={requestId}
            initialFrame={{
              problem: requestData?.designFrameProblem ?? "",
              successCriteria: requestData?.designFrameSuccessCriteria ?? "",
              constraints: requestData?.designFrameConstraints ?? "",
              divergence: requestData?.designFrameDivergence ?? "",
            }}
            originalProblem={requestData?.description ?? null}
          />
        )}

        {current && currentDesignStage !== "sense" && currentDesignStage !== "frame" && (
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">{getStageLabel(current.key)}</p>
            <p className="text-xs text-muted-foreground">{current.desc}</p>
          </div>
        )}

        {/* Prove stage: show ProveGate instead of advance button */}
        {isProveStage ? (
          <ProveGate requestId={requestId} myProfileRole={profileRole} isTestUser={isTestUser} />
        ) : (
          <>
            {/* Gate status for explore + handoff */}
            <div>
              {missing.length > 0 ? (
                <div className="bg-accent-warning/5 border border-accent-warning/15 rounded-lg px-3 py-2.5 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {isLastDesign ? "To hand off to dev:" : `To advance to ${nextStage ? getStageLabel(nextStage.key) : ""}:`}
                  </p>
                  {missing.map((m, i) => (
                    <p key={i} className="text-[11px] text-accent-warning/80 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-accent-warning/60 shrink-0" />
                      {m}
                    </p>
                  ))}
                </div>
              ) : (
                <Callout variant="success" className="flex items-center gap-2">
                  <span className="text-xs">✓</span>
                  <p className="text-[11px]">
                    {isLastDesign ? "Ready to hand off to dev" : `Ready to advance to ${nextStage ? getStageLabel(nextStage.key) : ""}`}
                  </p>
                </Callout>
              )}
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={handleAdvance}
              disabled={!canAdvance}
            >
              {isLastDesign ? "Hand off to Dev" : `Advance to ${nextStage ? getStageLabel(nextStage.key) : ""}`}
              <kbd className="hidden md:inline ml-2 text-[10px] border border-border/80 rounded px-1 py-0.5 font-mono opacity-60">
                ⌘↵
              </kbd>
            </Button>
          </>
        )}

        {error && (
          <Callout variant="error">{error}</Callout>
        )}
      </div>

      {/* Iterations section — shown during diverge & converge */}
      {showIterations && (
        <div className="px-5 py-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">
              Iterations{iterationsList.length > 0 ? ` (${iterationsList.length})` : ""}
            </p>
            <Button
              variant="link"
              size="sm"
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-medium"
            >
              <Plus size={12} />
              Add Direction
            </Button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <form onSubmit={handleAddIteration} className="space-y-2 p-3 rounded-lg bg-muted border">
              <Input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Direction title"
                className="text-xs"
              />
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="text-xs resize-none"
              />
              <Input
                type="url"
                value={newFigmaUrl}
                onChange={(e) => setNewFigmaUrl(e.target.value)}
                placeholder="Figma URL (optional)"
                className="text-xs"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={addingIteration || !newTitle.trim()}
                >
                  {addingIteration ? "Adding..." : "Add"}
                </Button>
              </div>
            </form>
          )}

          {/* Iteration list */}
          {iterationsList.length === 0 && !showAddForm && (
            <p className="text-[11px] text-muted-foreground/60 py-2">
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

      <ProveFirstTimeModal
        open={showProveModal}
        onClose={() => setShowProveModal(false)}
        onProceed={() => {
          setShowProveModal(false);
          setSeenHints((prev) => ({ ...(prev ?? {}), prove_modal: true }));
          doAdvance();
        }}
      />
    </div>
  );
}
