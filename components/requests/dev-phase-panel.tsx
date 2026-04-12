// components/requests/dev-phase-panel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PanelHeader } from "@/components/ui/panel-header";
import { SectionLabel } from "@/components/ui/section-label";
import { Textarea } from "@/components/ui/textarea";

const STATES = [
  { key: "todo",        label: "To Do",       desc: "Waiting for dev to pick up" },
  { key: "in_progress", label: "In Progress", desc: "Dev actively building" },
  { key: "in_review",   label: "In Review",   desc: "Code review in progress" },
  { key: "qa",          label: "QA",          desc: "Quality assurance testing" },
  { key: "done",        label: "Done",        desc: "Shipped to production" },
] as const;

type KState = (typeof STATES)[number]["key"];

interface Props {
  requestId: string;
  kanbanState: KState;
  figmaUrl: string | null;
  figmaLockedAt: string | null;
  devQuestionCount: number;
}

export function DevPhasePanel({
  requestId,
  kanbanState,
  figmaUrl,
  figmaLockedAt,
  devQuestionCount,
}: Props) {
  const router = useRouter();
  const [optimisticKanban, setOptimisticKanban] = useState<KState>(kanbanState);
  const [shipping, setShipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askBody, setAskBody] = useState("");
  const [askSubmitting, setAskSubmitting] = useState(false);

  const currentIdx = STATES.findIndex((s) => s.key === kanbanState);
  const optimisticIdx = STATES.findIndex((s) => s.key === optimisticKanban);
  const current = STATES[currentIdx];
  const isDone = optimisticKanban === "done";

  async function moveState(newState: KState) {
    const previousState = optimisticKanban;
    setOptimisticKanban(newState);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/kanban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOptimisticKanban(previousState);
        setError(data.error ?? "Failed to move");
      } else {
        router.refresh();
      }
    } catch {
      setOptimisticKanban(previousState);
      setError("Network error");
    }
  }

  async function shipToTrack() {
    setShipping(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed to ship");
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setShipping(false);
    }
  }

  async function submitQuestion() {
    if (!askBody.trim()) return;
    setAskSubmitting(true);
    setError(null);
    try {
      await fetch(`/api/requests/${requestId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: askBody.trim(), isDevQuestion: true }),
      });
      setAskBody("");
      setAskOpen(false);
      router.refresh();
    } catch {
      setError("Failed to send question. Please try again.");
    } finally {
      setAskSubmitting(false);
    }
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <PanelHeader>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Phase 3 — Dev
        </span>
        <div className="flex items-center gap-2">
          {devQuestionCount > 0 && (
            <span className="text-[10px] font-mono bg-accent-warning/10 text-accent-warning border border-accent-warning/20 rounded px-1.5 py-0.5">
              {devQuestionCount} dev {devQuestionCount === 1 ? "question" : "questions"}
            </span>

          )}
          <span className="text-xs text-muted-foreground/60">Dev leads</span>
        </div>
      </PanelHeader>

      {/* Figma lock badge */}
      {figmaUrl && (
        <div className="px-5 py-2.5 border-b border-border/50 flex items-center gap-2">
          <SectionLabel className="mb-0">Figma</SectionLabel>
          <a
            href={figmaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:opacity-80 transition-colors truncate"
          >
            Open design
          </a>
          {figmaLockedAt && (
            <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
              locked {new Date(figmaLockedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* Kanban stepper */}
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-start">
          {STATES.map((s, i) => {
            const isPast = i < optimisticIdx;
            const isCur = s.key === optimisticKanban;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono border transition-colors ${
                    isPast ? "bg-accent-success/15 border-accent-success/30 text-accent-success"
                    : isCur ? "bg-[var(--phase-dev)]/15 border-[var(--phase-dev)]/30 text-[var(--phase-dev)]"
                    : "bg-accent/40 border text-muted-foreground/60"
                  }`}>
                    {isPast ? "✓" : i + 1}
                  </div>
                  <span className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center leading-tight ${
                    isCur ? "text-[var(--phase-dev)]" : isPast ? "text-accent-success/80" : "text-muted-foreground/60"
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < STATES.length - 1 && (
                  <div className={`h-px w-full mb-5 mx-0.5 ${i < optimisticIdx ? "bg-accent-success/20" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current state + actions */}
      <div className="px-5 py-4 space-y-3">
        {current && (
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">{current.label}</p>
            <p className="text-xs text-muted-foreground">{current.desc}</p>
          </div>
        )}

        {!isDone && optimisticIdx < STATES.length - 1 && (
          <div className="flex gap-2">
            {optimisticIdx > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => moveState(STATES[optimisticIdx - 1].key)}
              >
                ← {STATES[optimisticIdx - 1].label}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => moveState(STATES[optimisticIdx + 1].key)}
            >
              Move to {STATES[optimisticIdx + 1].label}
            </Button>
          </div>
        )}

        {isDone && (
          <div className="space-y-3">
            <Callout variant="success" className="flex items-center gap-2">
              <span className="text-xs">✓</span>
              <p className="text-[11px]">Dev complete — ready to ship to Track</p>
            </Callout>
            <Button
              variant="secondary"
              size="sm"
              onClick={shipToTrack}
              disabled={shipping}
            >
              {shipping && <span className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />}
              Ship to Track
            </Button>
          </div>
        )}

        {/* Ask Designer */}
        <div className="pt-1 border-t border-border/50">
          {!askOpen ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAskOpen(true)}
              className="w-full justify-start"
            >
              Ask designer a question
            </Button>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={askBody}
                onChange={(e) => setAskBody(e.target.value)}
                placeholder="What do you need clarification on?"
                rows={3}
                size="sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={submitQuestion}
                  disabled={askSubmitting || !askBody.trim()}
                  className="bg-accent-warning/10 hover:bg-accent-warning/20 text-accent-warning border-accent-warning/20"
                >
                  {askSubmitting ? "Sending…" : "Ask designer"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAskOpen(false); setAskBody(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <Callout variant="error">{error}</Callout>
        )}
      </div>
    </div>
  );
}
