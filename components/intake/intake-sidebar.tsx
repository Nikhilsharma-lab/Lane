"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIORITY_STYLE } from "@/lib/theme-colors";

export interface IntakeSidebarRequest {
  id: string;
  title: string;
  priority: string | null;
  requesterName: string;
  createdAt: Date | string;
  hasAiAnalysis: boolean;
}

interface IntakeSidebarProps {
  requests: IntakeSidebarRequest[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function IntakeSidebar({ requests, activeId, onSelect }: IntakeSidebarProps) {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const filtered = requests.filter((r) =>
    tab === "reviewed" ? r.hasAiAnalysis : !r.hasAiAnalysis
  );

  const pendingCount = requests.filter((r) => !r.hasAiAnalysis).length;
  const reviewedCount = requests.filter((r) => r.hasAiAnalysis).length;

  // J/K keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIdx((prev) => {
          const next = Math.min(prev + 1, filtered.length - 1);
          if (filtered[next]) onSelect(filtered[next].id);
          return next;
        });
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIdx((prev) => {
          const next = Math.max(prev - 1, 0);
          if (filtered[next]) onSelect(filtered[next].id);
          return next;
        });
      }
    },
    [filtered, onSelect]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Sync focused index when activeId changes
  useEffect(() => {
    const idx = filtered.findIndex((r) => r.id === activeId);
    if (idx !== -1) setFocusedIdx(idx);
  }, [activeId, filtered]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="px-4 pt-3.5 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            Intake
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {requests.length}
          </span>
        </div>

        {/* Tabs */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "pending" | "reviewed")}
          className="mt-2.5"
        >
          <TabsList variant="line">
            <TabsTrigger value="pending">
              Pending
              {pendingCount > 0 && (
                <span className="ml-1 text-[9px] text-muted-foreground/60">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              Reviewed
              {reviewedCount > 0 && (
                <span className="ml-1 text-[9px] text-muted-foreground/60">
                  {reviewedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Request list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="font-mono text-xs text-muted-foreground/60">
              {tab === "pending" ? "No pending requests." : "No reviewed requests."}
            </p>
          </div>
        ) : (
          filtered.map((r) => {
            const isActive = r.id === activeId;
            const relativeTime = formatDistanceToNow(
              typeof r.createdAt === "string" ? new Date(r.createdAt) : r.createdAt,
              { addSuffix: true }
            );

            return (
              <Button
                key={r.id}
                variant="ghost"
                onClick={() => onSelect(r.id)}
                className={cn(
                  "flex flex-col gap-0.5 w-full px-4 py-2.5 text-left border-b border-border cursor-pointer h-auto rounded-none items-start",
                  "border-l-2",
                  isActive
                    ? "bg-primary/10 border-l-primary"
                    : "bg-transparent border-l-transparent hover:bg-accent"
                )}
              >
                {/* Title row */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                    {r.title}
                  </span>
                  {r.hasAiAnalysis && (
                    <Sparkles size={11} className="text-primary shrink-0" />
                  )}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-1.5">
                  {r.priority && (
                    <span
                      className="inline-flex px-1 py-px rounded-sm text-[9px] font-semibold font-mono"
                      style={{
                        background: PRIORITY_STYLE[r.priority]?.bg ?? "hsl(var(--accent))",
                        color: PRIORITY_STYLE[r.priority]?.color ?? "hsl(var(--muted-foreground) / 0.6)",
                      }}
                    >
                      {r.priority.toUpperCase()}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {r.requesterName}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/60 ml-auto">
                    {relativeTime}
                  </span>
                </div>
              </Button>
            );
          })
        )}
      </div>

      {/* Keyboard hints */}
      <div className="px-4 py-1.5 border-t border-border flex gap-3 shrink-0">
        <span className="font-mono text-[10px] text-muted-foreground/60">
          J/K navigate
        </span>
      </div>
    </div>
  );
}
