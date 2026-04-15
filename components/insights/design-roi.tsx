"use client";

import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/ui/section-label";

interface RoiRow {
  requestType: string;
  count: number;
  avgVariancePercent: number;
  direction: "positive" | "negative" | "mixed";
}

function VariancePill({ v }: { v: number }) {
  const abs = Math.abs(v);
  const color =
    abs <= 10
      ? "text-accent-success bg-accent-success/10 border-accent-success/20"
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

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature",
  bug: "Bug fix",
  research: "Research",
  content: "Content",
  infra: "Infra",
  process: "Process",
  other: "Other",
};

const DIRECTION_ICONS: Record<RoiRow["direction"], string> = {
  positive: "↑",
  negative: "↓",
  mixed: "↔",
};

const DIRECTION_COLORS: Record<RoiRow["direction"], string> = {
  positive: "text-accent-success",
  negative: "text-accent-danger",
  mixed: "text-muted-foreground/60",
};

export function DesignRoi() {
  const [roi, setRoi] = useState<RoiRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights/design-roi")
      .then((r) => r.json())
      .then((d) => setRoi(d.roi ?? []))
      .catch((err) => { console.error("[design-roi] fetch ROI data failed:", err); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border rounded-xl p-5 space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="h-3 bg-accent rounded w-20" />
            <div className="h-3 bg-accent rounded w-12" />
            <div className="h-3 bg-accent rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!roi.length) {
    return (
      <div className="border rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground/60">No impact data yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Design ROI appears after impact is logged on completed requests
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] text-muted-foreground/60 uppercase tracking-wide px-5 py-2.5 border-b bg-muted gap-4">
        <span>Type</span>
        <span className="text-right">Requests</span>
        <span className="text-right">Avg variance</span>
        <span className="text-right">Direction</span>
      </div>
      <div className="divide-y">
        {roi.map((row) => (
          <div
            key={row.requestType}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-3 gap-4"
          >
            <span className="text-sm text-foreground">
              {TYPE_LABELS[row.requestType] ?? row.requestType}
            </span>
            <span className="text-xs text-muted-foreground text-right font-mono">
              {row.count}
            </span>
            <div className="flex justify-end">
              <VariancePill v={row.avgVariancePercent} />
            </div>
            <span
              className={`text-xs font-medium text-right ${DIRECTION_COLORS[row.direction]}`}
            >
              {DIRECTION_ICONS[row.direction]}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/60 px-5 py-2.5 border-t">
        Variance = (actual − predicted) / |predicted| × 100
      </p>
    </div>
  );
}
