"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface RecentPrediction {
  requestId: string;
  requestTitle: string;
  predictedValue: string;
  actualValue: string | null;
  variancePercent: number;
  measuredAt: string | null;
}

interface Calibration {
  pmId: string;
  fullName: string;
  role: string | null;
  predictionCount: number;
  avgVariancePercent: number;
  trend: "improving" | "worsening" | "stable";
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  recent: RecentPrediction[];
}

const LABEL_CONFIG: Record<
  Calibration["label"],
  { text: string; style: string; desc: string }
> = {
  well_calibrated: {
    text: "Well-calibrated",
    style: "text-green-400 bg-green-500/10 border-green-500/20",
    desc: "Predictions within ±10%",
  },
  over_optimistic: {
    text: "Over-optimistic",
    style: "text-red-400 bg-red-500/10 border-red-500/20",
    desc: "Consistently predicts more than delivered",
  },
  under_optimistic: {
    text: "Under-optimistic",
    style: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    desc: "Consistently delivers more than predicted",
  },
};

const TREND_ICONS: Record<Calibration["trend"], string> = {
  improving: "↑",
  worsening: "↓",
  stable: "→",
};

const TREND_COLORS: Record<Calibration["trend"], string> = {
  improving: "text-green-400",
  worsening: "text-red-400",
  stable: "text-zinc-500",
};

function VariancePill({ v }: { v: number }) {
  const abs = Math.abs(v);
  const color =
    abs <= 10 ? "text-green-400 bg-green-500/10 border-green-500/20"
    : abs <= 25 ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
    : "text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${color}`}>
      {v > 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

export function PmCalibration() {
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pm/calibration")
      .then((r) => r.json())
      .then((d) => setCalibrations(d.calibrations ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border border-zinc-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-zinc-600">Loading calibration data...</span>
      </div>
    );
  }

  if (!calibrations.length) {
    return (
      <div className="border border-zinc-800/50 rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-zinc-600">No impact data yet</p>
        <p className="text-xs text-zinc-700 mt-1">
          PM calibration scores appear after impact is logged on completed requests
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {calibrations.map((c) => {
        const cfg = LABEL_CONFIG[c.label];
        const isExpanded = expanded === c.pmId;

        return (
          <div key={c.pmId} className="border border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isExpanded ? null : c.pmId)}
              className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-zinc-900/40 transition-colors"
            >
              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-zinc-200 font-medium">{c.fullName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.style}`}>
                    {cfg.text}
                  </span>
                  <span className={`text-xs font-medium ${TREND_COLORS[c.trend]}`}>
                    {TREND_ICONS[c.trend]}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {c.predictionCount} prediction{c.predictionCount !== 1 ? "s" : ""} · {cfg.desc}
                </p>
              </div>

              {/* Avg variance */}
              <div className="shrink-0 text-right">
                <VariancePill v={c.avgVariancePercent} />
                <p className="text-[10px] text-zinc-700 mt-0.5">avg variance</p>
              </div>

              {/* Expand chevron */}
              <span className="text-zinc-700 text-xs shrink-0">{isExpanded ? "▲" : "▼"}</span>
            </button>

            {/* Expanded: recent predictions */}
            {isExpanded && c.recent.length > 0 && (
              <div className="border-t border-zinc-800/60 divide-y divide-zinc-800/40">
                {c.recent.map((p) => (
                  <div key={p.requestId} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/dashboard/requests/${p.requestId}`}
                        className="text-xs text-zinc-300 hover:text-zinc-100 transition-colors truncate block"
                      >
                        {p.requestTitle}
                      </Link>
                      <p className="text-[11px] text-zinc-600 mt-0.5">
                        Predicted <span className="text-zinc-500">{p.predictedValue}</span>
                        {" · "}
                        Actual <span className="text-zinc-400">{p.actualValue ?? "—"}</span>
                      </p>
                    </div>
                    <VariancePill v={p.variancePercent} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[10px] text-zinc-700 text-center pt-1">
        Variance = (actual − predicted) / |predicted| × 100
      </p>
    </div>
  );
}
