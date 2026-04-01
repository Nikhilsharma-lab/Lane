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
}

export function DevPhasePanel({ requestId, kanbanState, figmaUrl, figmaLockedAt }: Props) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIdx = STATES.findIndex((s) => s.key === kanbanState);
  const current = STATES[currentIdx];
  const isDone = kanbanState === "done";

  async function moveState(newState: KState) {
    setMoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/kanban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed to move");
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setMoving(false);
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

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Phase 3 — Dev
        </span>
        <span className="text-xs text-zinc-600">Dev leads</span>
      </div>

      {/* Figma lock badge */}
      {figmaUrl && (
        <div className="px-5 py-2.5 border-b border-zinc-800/50 flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wide">Figma</span>
          <a
            href={figmaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors truncate"
          >
            Open design
          </a>
          {figmaLockedAt && (
            <span className="text-[10px] text-zinc-700 ml-auto shrink-0">
              locked {new Date(figmaLockedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* Kanban stepper */}
      <div className="px-5 py-4 border-b border-zinc-800/50">
        <div className="flex items-start">
          {STATES.map((s, i) => {
            const isPast = i < currentIdx;
            const isCur = s.key === kanbanState;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono border transition-colors ${
                      isPast
                        ? "bg-green-500/15 border-green-500/30 text-green-400"
                        : isCur
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                        : "bg-zinc-800/40 border-zinc-700/40 text-zinc-600"
                    }`}
                  >
                    {isPast ? "✓" : i + 1}
                  </div>
                  <span
                    className={`text-[9px] mt-1 font-medium uppercase tracking-wide text-center leading-tight ${
                      isCur ? "text-indigo-400" : isPast ? "text-green-500/80" : "text-zinc-600"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STATES.length - 1 && (
                  <div className={`h-px w-full mb-5 mx-0.5 ${i < currentIdx ? "bg-green-500/20" : "bg-zinc-800"}`} />
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
            <p className="text-xs font-semibold text-zinc-200 mb-0.5">{current.label}</p>
            <p className="text-xs text-zinc-500">{current.desc}</p>
          </div>
        )}

        {/* Move buttons */}
        {!isDone && (
          <div className="flex gap-2">
            {currentIdx > 0 && (
              <button
                onClick={() => moveState(STATES[currentIdx - 1].key)}
                disabled={moving}
                className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← {STATES[currentIdx - 1].label}
              </button>
            )}
            <button
              onClick={() => moveState(STATES[currentIdx + 1].key)}
              disabled={moving}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {moving && (
                <span className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />
              )}
              Move to {STATES[currentIdx + 1].label}
            </button>
          </div>
        )}

        {/* Done state: ship to track */}
        {isDone && (
          <div className="space-y-3">
            <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-green-400 text-xs">✓</span>
              <p className="text-[11px] text-green-400/80">Dev complete — ready to ship to Track</p>
            </div>
            <button
              onClick={shipToTrack}
              disabled={shipping}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {shipping && (
                <span className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />
              )}
              Ship to Track
            </button>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
