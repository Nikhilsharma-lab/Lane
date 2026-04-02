"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  requestId: string;
  trackStage: "measuring" | "complete";
  impactMetric: string | null;
  impactPrediction: string | null;
  impactActual: string | null;
}

export function TrackPhasePanel({
  requestId,
  trackStage,
  impactMetric,
  impactPrediction,
  impactActual,
}: Props) {
  const router = useRouter();
  const [actual, setActual] = useState(impactActual ?? "");
  const [optimisticActual, setOptimisticActual] = useState<string | null>(impactActual);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!actual.trim()) return;
    const previousActual = optimisticActual;
    setOptimisticActual(actual.trim());
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/impact-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualValue: actual.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOptimisticActual(previousActual);
        setError(data.error ?? "Failed to save");
      } else {
        router.refresh();
      }
    } catch {
      setOptimisticActual(previousActual);
      setError("Network error");
    }
  }

  async function markComplete() {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed to complete");
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setCompleting(false);
    }
  }

  const isComplete = trackStage === "complete";

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Phase 4 — Track
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
          isComplete
            ? "text-green-400 bg-green-500/10 border-green-500/20"
            : "text-amber-400 bg-amber-500/10 border-amber-500/20"
        }`}>
          {isComplete ? "Complete" : "Measuring"}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Predicted impact */}
        {impactMetric && (
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Metric</p>
            <p className="text-xs text-zinc-300">{impactMetric}</p>
          </div>
        )}

        {impactPrediction && (
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Predicted</p>
            <p className="text-xs text-zinc-400">{impactPrediction}</p>
          </div>
        )}

        {/* Actual impact */}
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">Actual result</p>
          {isComplete ? (
            <p className="text-xs text-zinc-300">{optimisticActual ?? "—"}</p>
          ) : (
            <div className="space-y-2">
              {optimisticActual && (
                <p className="text-xs text-zinc-300">{optimisticActual}</p>
              )}
              <input
                type="text"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="e.g. +4.2% retention"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <button
                onClick={handleSave}
                disabled={!actual.trim()}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* Mark complete */}
        {!isComplete && optimisticActual && (
          <button
            onClick={markComplete}
            disabled={completing}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {completing && (
              <span className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />
            )}
            Mark complete
          </button>
        )}

        {isComplete && (
          <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-green-400 text-xs">✓</span>
            <p className="text-[11px] text-green-400/80">Impact recorded — request complete</p>
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
