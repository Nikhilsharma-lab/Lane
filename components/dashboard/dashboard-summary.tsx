"use client";

import { useState } from "react";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";

type SummaryTab = "pipeline" | "team" | "priority";

interface PhaseStat {
  key: string;
  label: string;
  count: number;
}

interface PriorityStat {
  key: string;
  label: string;
  count: number;
}

interface TeamStat {
  name: string;
  count: number;
  initials: string;
}

interface DashboardSummaryProps {
  phases: PhaseStat[];
  priorities: PriorityStat[];
  team: TeamStat[];
  totalRequests: number;
  shippedThisWeek: number;
}

const TABS: { key: SummaryTab; label: string }[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "team", label: "Team" },
  { key: "priority", label: "Priority" },
];

export function DashboardSummary({
  phases,
  priorities,
  team,
  totalRequests,
  shippedThisWeek,
}: DashboardSummaryProps) {
  const [activeTab, setActiveTab] = useState<SummaryTab>("pipeline");

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-3">
        {TABS.map((tab) => (
          // eslint-disable-next-line no-restricted-syntax -- tab button with custom styling
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              activeTab === tab.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="border-t" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "pipeline" && (
          <div className="space-y-1">
            {phases.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between py-1.5 px-1"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ background: `var(--phase-${p.key})` }}
                  />
                  <span className="text-sm text-foreground">{p.label}</span>
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {p.count}
                </span>
              </div>
            ))}

            {shippedThisWeek > 0 && (
              <>
                <div className="border-t my-2" />
                <div className="flex items-center justify-between py-1.5 px-1">
                  <span className="text-sm text-accent-success">
                    Shipped this week
                  </span>
                  <span className="text-sm text-accent-success tabular-nums font-medium">
                    {shippedThisWeek}
                  </span>
                </div>
              </>
            )}

            <div className="border-t my-2" />
            <div className="flex items-center justify-between py-1.5 px-1">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {totalRequests}
              </span>
            </div>
          </div>
        )}

        {activeTab === "team" && (
          <div className="space-y-1">
            {team.map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between py-1.5 px-1"
              >
                <div className="flex items-center gap-2.5">
                  <span className="size-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                    {t.initials}
                  </span>
                  <span className="text-sm text-foreground">{t.name}</span>
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {t.count}
                </span>
              </div>
            ))}
            {team.length === 0 && (
              <p className="text-sm text-muted-foreground/60 py-4">
                No active assignments
              </p>
            )}
          </div>
        )}

        {activeTab === "priority" && (
          <div className="space-y-1">
            {priorities.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between py-1.5 px-1"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ background: `var(--priority-${p.key})` }}
                  />
                  <span className="text-sm text-foreground">
                    {p.label}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {p.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
