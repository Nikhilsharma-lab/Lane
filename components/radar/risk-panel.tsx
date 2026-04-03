"use client";

import { useState } from "react";
import Link from "next/link";
import type { RiskRow, FigmaDriftRow } from "@/lib/radar";

const PRIORITY_COLORS: Record<string, string> = {
  p0: "text-red-400",
  p1: "text-orange-400",
  p2: "text-yellow-400",
  p3: "text-[var(--text-secondary)]",
};

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span
      className={`text-[10px] font-mono ${PRIORITY_COLORS[priority] ?? "text-[var(--text-secondary)]"} bg-[var(--bg-subtle)] border border-[var(--border)] rounded px-1 shrink-0`}
    >
      {priority.toUpperCase()}
    </span>
  );
}

function RiskSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--bg-subtle)] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-medium text-[var(--text-primary)]">{title}</span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono ${count > 0 ? "text-red-400" : "text-green-400"}`}
          >
            {count}
          </span>
          <span className="text-[var(--text-tertiary)] text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div className="border-t border-[var(--border)]">{children}</div>}
    </div>
  );
}

export function RiskPanel({
  risk,
}: {
  risk: {
    stalled: RiskRow[];
    signOffOverdue: RiskRow[];
    figmaDrift: FigmaDriftRow[];
  };
}) {
  return (
    <div className="space-y-3">
      {/* Stalled */}
      <RiskSection title="Stalled Requests" count={risk.stalled.length}>
        {risk.stalled.length === 0 ? (
          <p className="px-5 py-3 text-sm text-green-500">All clear</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {risk.stalled.map((r) => (
              <Link
                key={r.requestId}
                href={`/dashboard/requests/${r.requestId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <PriorityBadge priority={r.priority} />
                <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{r.title}</span>
                <span className="text-xs text-[var(--text-secondary)] capitalize shrink-0">{r.phase}</span>
                <span className="text-xs text-[var(--text-secondary)] shrink-0">{r.designerName}</span>
                <span className="text-xs text-red-400 shrink-0">{r.staleDays}d stalled</span>
              </Link>
            ))}
          </div>
        )}
      </RiskSection>

      {/* Sign-off overdue */}
      <RiskSection title="Sign-off Overdue" count={risk.signOffOverdue.length}>
        {risk.signOffOverdue.length === 0 ? (
          <p className="px-5 py-3 text-sm text-green-500">All clear</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {risk.signOffOverdue.map((r) => (
              <Link
                key={r.requestId}
                href={`/dashboard/requests/${r.requestId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <PriorityBadge priority={r.priority} />
                <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{r.title}</span>
                <span className="text-xs text-[var(--text-secondary)] shrink-0">Waiting for sign-offs</span>
                <span className="text-xs text-red-400 shrink-0">{r.staleDays}d</span>
              </Link>
            ))}
          </div>
        )}
      </RiskSection>

      {/* Figma drift */}
      <RiskSection
        title="Post-Handoff Figma Drift"
        count={risk.figmaDrift.length}
      >
        {risk.figmaDrift.length === 0 ? (
          <p className="px-5 py-3 text-sm text-green-500">All clear</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {risk.figmaDrift.map((r) => (
              <Link
                key={r.requestId}
                href={`/dashboard/requests/${r.requestId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <PriorityBadge priority={r.priority} />
                <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{r.title}</span>
                <span className="text-xs text-[var(--text-secondary)] shrink-0">
                  Figma updated post-handoff
                </span>
                <span className="text-xs text-amber-400 shrink-0">
                  {r.unreviewedCount} unreviewed
                </span>
              </Link>
            ))}
          </div>
        )}
      </RiskSection>
    </div>
  );
}
