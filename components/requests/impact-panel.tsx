"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  requestId: string;
  impactMetric: string | null;
  impactPrediction: string | null;
  impactActual: string | null;
  impactLoggedAt: Date | string | null;
  stage: string;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function ImpactPanel({
  requestId,
  impactMetric,
  impactPrediction,
  impactActual,
  impactLoggedAt,
  stage,
}: Props) {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasPrediction = impactMetric || impactPrediction;
  const canLog = stage === "impact" || stage === "build";

  if (!hasPrediction && !impactActual) return null;

  function handleLog() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/requests/${requestId}/impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impactActual: actual }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setActual("");
        router.refresh();
      }
    });
  }

  return (
    <section className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Impact</span>
      </div>

      <div className="p-5 space-y-4">
        {hasPrediction && (
          <div className="grid grid-cols-2 gap-4">
            {impactMetric && (
              <div>
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Metric</div>
                <div className="text-sm text-[var(--text-primary)]">{impactMetric}</div>
              </div>
            )}
            {impactPrediction && (
              <div>
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Predicted</div>
                <div className="text-sm text-[var(--text-primary)]">{impactPrediction}</div>
              </div>
            )}
          </div>
        )}

        {impactActual ? (
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg px-4 py-3">
            <div className="text-[10px] text-green-500/70 uppercase tracking-wide mb-1">
              Actual result · {impactLoggedAt ? formatDate(impactLoggedAt) : ""}
            </div>
            <div className="text-sm text-green-400">{impactActual}</div>
          </div>
        ) : canLog ? (
          <div className="space-y-2">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">Log actual result</div>
            <div className="flex gap-2">
              <input
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="e.g. +7.2% improvement in conversion"
                className="flex-1 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
              <button
                onClick={handleLog}
                disabled={isPending || !actual.trim()}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-[var(--accent-text)] rounded-lg font-medium hover:bg-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? "…" : "Log"}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">Actual result can be logged once the request reaches the Impact stage</p>
        )}
      </div>
    </section>
  );
}
