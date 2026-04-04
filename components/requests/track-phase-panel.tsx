"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImpactRetrospectivePanel } from "@/components/requests/impact-retrospective-panel";

interface Props {
  requestId: string;
  trackStage: "measuring" | "complete";
  impactMetric: string | null;
  impactPrediction: string | null;
  impactActual: string | null;
  predictionScore: number | null;
  predictionLabel: string | null;
  existingRetrospective: import("@/db/schema").ImpactRetrospective | null;
}

export function TrackPhasePanel({
  requestId,
  trackStage,
  impactMetric,
  impactPrediction,
  impactActual,
  predictionScore,
  predictionLabel,
  existingRetrospective,
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
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
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
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Metric</p>
            <p className="text-xs text-[var(--text-primary)]">{impactMetric}</p>
          </div>
        )}

        {impactPrediction && (
          <div>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Predicted</p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-[var(--text-secondary)]">{impactPrediction}</p>
              {predictionScore !== null && predictionLabel && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                  predictionScore >= 70
                    ? "text-green-400 bg-green-500/10 border-green-500/20"
                    : predictionScore >= 40
                    ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    : "text-red-400 bg-red-500/10 border-red-500/20"
                }`}>
                  {predictionScore}/100 confidence
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actual impact */}
        <div>
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">Actual result</p>
          {isComplete ? (
            <p className="text-xs text-[var(--text-primary)]">{optimisticActual ?? "—"}</p>
          ) : (
            <div className="space-y-2">
              {optimisticActual && (
                <p className="text-xs text-[var(--text-primary)]">{optimisticActual}</p>
              )}
              <input
                type="text"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="e.g. +4.2% retention"
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
              <button
                onClick={handleSave}
                disabled={!actual.trim()}
                className="text-xs bg-[var(--bg-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="text-xs bg-[var(--bg-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {completing && (
              <span className="w-3 h-3 border border-[var(--text-secondary)] border-t-transparent rounded-full animate-spin" />
            )}
            Mark complete
          </button>
        )}

        {isComplete && (
          <>
            <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-green-400 text-xs">✓</span>
              <p className="text-[11px] text-green-400/80">Impact recorded — request complete</p>
            </div>
            <ImpactRetrospectivePanel
              requestId={requestId}
              existingRetrospective={existingRetrospective}
            />
          </>
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
