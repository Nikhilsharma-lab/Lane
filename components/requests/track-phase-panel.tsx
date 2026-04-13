// components/requests/track-phase-panel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelHeader } from "@/components/ui/panel-header";
import { SectionLabel } from "@/components/ui/section-label";

interface Props {
  requestId: string;
  trackStage: "measuring" | "complete";
  impactMetric: string | null;
  impactPrediction: string | null;
  impactActual: string | null;
  initialVariancePercent: number | null;
}

function varianceConfig(v: number): { label: string; style: string } {
  const abs = Math.abs(v);
  if (abs <= 10)
    return {
      label: "Well-calibrated",
      style: "text-accent-success bg-accent-success/10 border-accent-success/20",
    };
  if (v < -10)
    return {
      label: "Over-optimistic",
      style: "text-accent-danger bg-accent-danger/10 border-accent-danger/20",
    };
  return {
    label: "Under-optimistic",
    style: "text-accent-warning bg-accent-warning/10 border-accent-warning/20",
  };
}

export function TrackPhasePanel({
  requestId,
  trackStage,
  impactMetric,
  impactPrediction,
  impactActual,
  initialVariancePercent,
}: Props) {
  const router = useRouter();
  const [actual, setActual] = useState(impactActual ?? "");
  const [optimisticActual, setOptimisticActual] = useState<string | null>(impactActual);
  const [variancePercent, setVariancePercent] = useState<number | null>(initialVariancePercent);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!actual.trim()) return;
    const previousActual = optimisticActual;
    const previousVariance = variancePercent;
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
        setVariancePercent(previousVariance);
        setError(data.error ?? "Failed to save");
      } else {
        if (typeof data.variancePercent === "number") {
          setVariancePercent(data.variancePercent);
        }
        router.refresh();
      }
    } catch {
      setOptimisticActual(previousActual);
      setVariancePercent(previousVariance);
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
  const vcfg = variancePercent !== null ? varianceConfig(variancePercent) : null;

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <PanelHeader>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Phase 4 — Track
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
            isComplete
              ? "text-accent-success bg-accent-success/10 border-accent-success/20"
              : "text-accent-warning bg-accent-warning/10 border-accent-warning/20"
          }`}
        >
          {isComplete ? "Complete" : "Measuring"}
        </span>
      </PanelHeader>

      <div className="px-5 py-4 space-y-4">
        {/* Metric */}
        {impactMetric && (
          <div>
            <SectionLabel className="mb-1">Metric</SectionLabel>
            <p className="text-xs text-foreground">{impactMetric}</p>
          </div>
        )}

        {/* Predicted */}
        {impactPrediction && (
          <div>
            <SectionLabel className="mb-1">Predicted</SectionLabel>
            <p className="text-xs text-muted-foreground">{impactPrediction}</p>
          </div>
        )}

        {/* Actual result */}
        <div>
          <SectionLabel>Actual result</SectionLabel>
          {isComplete ? (
            <p className="text-xs text-foreground">{optimisticActual ?? "—"}</p>
          ) : (
            <div className="space-y-2">
              {optimisticActual && (
                <p className="text-xs text-foreground">{optimisticActual}</p>
              )}
              <Input
                type="text"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="e.g. +4.2% retention"
                inputSize="sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={!actual.trim()}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        {/* Accuracy block — shown when variance is known */}
        {vcfg && optimisticActual && (
          <div className="border rounded-lg px-4 py-3 space-y-2.5 bg-muted">
            <SectionLabel className="mb-0">Accuracy</SectionLabel>
            {impactPrediction && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground/60">Predicted</span>
                <span className="font-mono text-muted-foreground">{impactPrediction}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/60">Variance</span>
              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${vcfg.style}`}>
                {variancePercent! > 0 ? "+" : ""}
                {variancePercent!.toFixed(1)}%
              </span>
            </div>
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium ${vcfg.style}`}>
              {vcfg.label}
            </span>
          </div>
        )}

        {/* Mark complete */}
        {!isComplete && optimisticActual && (
          <Button
            variant="default"
            size="sm"
            onClick={markComplete}
            disabled={completing}
            className="flex items-center gap-2"
          >
            {completing && (
              <span className="w-3 h-3 border border-primary-foreground border-t-transparent rounded-full animate-spin" />
            )}
            Mark complete
          </Button>
        )}

        {isComplete && (
          <div className="bg-accent-success/5 border border-accent-success/15 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-accent-success text-xs">✓</span>
            <p className="text-[11px] text-accent-success/80">Impact recorded — request complete</p>
          </div>
        )}

        {error && (
          <p className="text-xs text-accent-danger bg-accent-danger/10 border border-accent-danger/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
