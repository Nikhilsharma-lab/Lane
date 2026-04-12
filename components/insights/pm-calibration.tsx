"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import type { PmCoachingNote, RecentPrediction } from "@/lib/digest";

// Re-export types the parent may use
export type { PmCoachingNote };

// Legacy shape from /api/pm/calibration (used when coaching prop is not provided)
interface LegacyCalibration {
  pmId: string;
  fullName: string;
  role: string | null;
  predictionCount: number;
  avgVariancePercent: number;
  trend: "improving" | "worsening" | "stable";
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  recent: RecentPrediction[];
}

interface Props {
  coaching?: PmCoachingNote[];
}

const LABEL_CONFIG: Record<
  "well_calibrated" | "over_optimistic" | "under_optimistic",
  { text: string; style: string; desc: string }
> = {
  well_calibrated: {
    text: "Well-calibrated",
    style: "text-[var(--accent-success)] bg-[var(--accent-success)]/10 border-[var(--accent-success)]/20",
    desc: "Predictions within ±10%",
  },
  over_optimistic: {
    text: "Over-optimistic",
    style: "text-accent-danger bg-accent-danger/10 border-accent-danger/20",
    desc: "Consistently predicts more than delivered",
  },
  under_optimistic: {
    text: "Under-optimistic",
    style: "text-accent-warning bg-accent-warning/10 border-accent-warning/20",
    desc: "Consistently delivers more than predicted",
  },
};

const TREND_ICONS = { improving: "↑", worsening: "↓", stable: "→" };
const TREND_COLORS = {
  improving: "text-[var(--accent-success)]",
  worsening: "text-accent-danger",
  stable: "text-muted-foreground",
};

function VariancePill({ v }: { v: number }) {
  const abs = Math.abs(v);
  const color =
    abs <= 10
      ? "text-[var(--accent-success)] bg-[var(--accent-success)]/10 border-[var(--accent-success)]/20"
      : abs <= 25
      ? "text-accent-warning bg-accent-warning/10 border-accent-warning/20"
      : "text-accent-danger bg-accent-danger/10 border-accent-danger/20";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${color}`}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

// Normalise LegacyCalibration or PmCoachingNote to a common display shape
type DisplayEntry = {
  pmId: string;
  fullName: string;
  predictionCount: number;
  avgVariancePercent: number;
  trend: "improving" | "worsening" | "stable";
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  recent: RecentPrediction[];
  note?: string;
};

function fromCoachingNote(c: PmCoachingNote): DisplayEntry {
  return { ...c, note: c.note };
}

function fromLegacy(c: LegacyCalibration): DisplayEntry {
  return { ...c };
}

export function PmCalibration({ coaching }: Props) {
  const [entries, setEntries] = useState<DisplayEntry[]>(
    coaching ? coaching.map(fromCoachingNote) : []
  );
  const [loading, setLoading] = useState(!coaching);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Only fetch from API when coaching prop is not provided
  useEffect(() => {
    if (coaching) return;
    fetch("/api/pm/calibration")
      .then((r) => r.json())
      .then((d: { calibrations: LegacyCalibration[] }) =>
        setEntries((d.calibrations ?? []).map(fromLegacy))
      )
      .finally(() => setLoading(false));
  }, [coaching]);

  // If coaching prop updates (digest regenerated), sync entries
  useEffect(() => {
    if (!coaching) return;
    setEntries(coaching.map(fromCoachingNote));
    setLoading(false);
  }, [coaching]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border border-border/80 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground/60">Loading calibration data...</span>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="border rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground/60">No impact data yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          PM calibration scores appear after impact is logged on completed requests
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((c) => {
        const cfg = LABEL_CONFIG[c.label];
        const isExpanded = expanded === c.pmId;

        return (
          <div key={c.pmId} className="border rounded-xl overflow-hidden">
            <Button
              variant="ghost"
              onClick={() => setExpanded(isExpanded ? null : c.pmId)}
              className="w-full px-5 py-4 h-auto flex items-center gap-4 text-left rounded-none"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-foreground font-medium">{c.fullName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.style}`}>
                    {cfg.text}
                  </span>
                  <span className={`text-xs font-medium ${TREND_COLORS[c.trend]}`}>
                    {TREND_ICONS[c.trend]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {c.predictionCount} prediction{c.predictionCount !== 1 ? "s" : ""} · {cfg.desc}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <VariancePill v={c.avgVariancePercent} />
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">avg variance</p>
              </div>
              <span className="text-muted-foreground/60 text-xs shrink-0">
                {isExpanded ? "▲" : "▼"}
              </span>
            </Button>

            {isExpanded && (
              <div className="border-t">
                {/* AI coaching note */}
                {c.note && (
                  <div className="px-5 py-3 bg-muted">
                    <SectionLabel>
                      Coaching
                    </SectionLabel>
                    <p className="text-xs text-muted-foreground leading-relaxed italic">
                      &ldquo;{c.note}&rdquo;
                    </p>
                  </div>
                )}

                {/* Recent predictions */}
                {c.recent.length > 0 && (
                  <div className="divide-y">
                    {c.recent.map((p) => (
                      <div key={p.requestId} className="px-5 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/dashboard/requests/${p.requestId}`}
                            className="text-xs text-foreground hover:text-foreground transition-colors truncate block"
                          >
                            {p.requestTitle}
                          </Link>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                            Predicted{" "}
                            <span className="text-muted-foreground">{p.predictedValue}</span>
                            {" · "}
                            Actual{" "}
                            <span className="text-muted-foreground">
                              {p.actualValue ?? "—"}
                            </span>
                          </p>
                        </div>
                        <VariancePill v={p.variancePercent} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[10px] text-muted-foreground/60 text-center pt-1">
        Variance = (actual − predicted) / |predicted| × 100
      </p>
    </div>
  );
}
