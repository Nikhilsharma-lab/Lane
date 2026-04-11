// components/requests/dev-phase-panel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      <div className="px-5 py-3 border-b bg-muted flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Phase 3 — Dev
        </span>
        <div className="flex items-center gap-2">
          {devQuestionCount > 0 && (
            <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5">
              {devQuestionCount} dev {devQuestionCount === 1 ? "question" : "questions"}
            </span>
          )}
          <span className="text-xs text-muted-foreground/60">Dev leads</span>
        </div>
      </div>

      {/* Figma lock badge */}
      {figmaUrl && (
        <div className="px-5 py-2.5 border-b border-border/50 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Figma</span>
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
                    isPast ? "bg-green-500/15 border-green-500/30 text-green-400"
                    : isCur ? "bg-[#7DA5C4]/15 border-[#7DA5C4]/30 text-[#7DA5C4]"
                    : "bg-accent/40 border text-muted-foreground/60"
                  }`}>
                    {isPast ? "✓" : i + 1}
                  </div>
                  <span className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center leading-tight ${
                    isCur ? "text-[#7DA5C4]" : isPast ? "text-green-500/80" : "text-muted-foreground/60"
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < STATES.length - 1 && (
                  <div className={`h-px w-full mb-5 mx-0.5 ${i < optimisticIdx ? "bg-green-500/20" : "bg-border"}`} />
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
              <button
                onClick={() => moveState(STATES[optimisticIdx - 1].key)}
                className="text-xs text-muted-foreground hover:text-foreground border hover:border-border/80 px-3 py-1.5 rounded-lg transition-colors"
              >
                ← {STATES[optimisticIdx - 1].label}
              </button>
            )}
            <button
              onClick={() => moveState(STATES[optimisticIdx + 1].key)}
              className="text-xs bg-accent hover:bg-accent/80 text-foreground px-3 py-1.5 rounded-lg border transition-colors"
            >
              Move to {STATES[optimisticIdx + 1].label}
            </button>
          </div>
        )}

        {isDone && (
          <div className="space-y-3">
            <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-green-400 text-xs">✓</span>
              <p className="text-[11px] text-green-400/80">Dev complete — ready to ship to Track</p>
            </div>
            <button
              onClick={shipToTrack}
              disabled={shipping}
              className="text-xs bg-accent hover:bg-accent/80 text-foreground px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {shipping && <span className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />}
              Ship to Track
            </button>
          </div>
        )}

        {/* Ask Designer */}
        <div className="pt-1 border-t border-border/50">
          {!askOpen ? (
            <button
              onClick={() => setAskOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground border hover:border-border/80 px-3 py-1.5 rounded-lg transition-colors w-full text-left"
            >
              Ask designer a question
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={askBody}
                onChange={(e) => setAskBody(e.target.value)}
                placeholder="What do you need clarification on?"
                rows={3}
                className="w-full text-xs bg-muted border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:border-border/80"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitQuestion}
                  disabled={askSubmitting || !askBody.trim()}
                  className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {askSubmitting ? "Sending…" : "Ask designer"}
                </button>
                <button
                  onClick={() => { setAskOpen(false); setAskBody(""); }}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
