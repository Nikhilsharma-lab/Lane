"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { MorningBriefingRow } from "@/db/schema/morning_briefings";

interface Props {
  brief: MorningBriefingRow | null;
  alertCount?: number;
}

function formatGeneratedTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function MorningBriefingCard({ brief, alertCount = 0 }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generateFailed, setGenerateFailed] = useState(false);

  async function handleGenerate() {
    if (refreshing) return;
    setRefreshing(true);
    setGenerateFailed(false);
    try {
      const res = await fetch("/api/morning-briefing", { method: "POST" });
      if (res.ok) {
        window.location.reload();
      } else {
        setGenerateFailed(true);
        setRefreshing(false);
      }
    } catch {
      setGenerateFailed(true);
      setRefreshing(false);
    }
  }

  // No briefing yet — show a placeholder so the feature is discoverable
  if (!brief || brief.dismissedAt || dismissed) {
    if (brief?.dismissedAt || dismissed) return null;
    return (
      <div className="flex items-center gap-2 border-b bg-card px-5 h-9">
        <span className="size-1.5 rounded-full bg-border shrink-0" aria-hidden />
        <span className="text-xs font-semibold text-muted-foreground/50">
          Morning Briefing
        </span>
        {generateFailed ? (
          <span className="text-[10px] font-mono text-muted-foreground/60">
            Unavailable, try again later
          </span>
        ) : (
          <Button
            variant="outline"
            size="xs"
            className="font-mono"
            onClick={handleGenerate}
            disabled={refreshing}
          >
            {refreshing ? "Generating..." : "Generate"}
          </Button>
        )}
      </div>
    );
  }

  const content = brief.content;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const generatedTime = brief.generatedAt
    ? formatGeneratedTime(new Date(brief.generatedAt))
    : null;

  async function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed(true);
    try {
      const res = await fetch("/api/morning-briefing/dismiss", { method: "POST" });
      if (!res.ok) setDismissed(false);
    } catch {
      setDismissed(false);
    }
  }

  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation();
    handleGenerate();
  }

  function toggle() {
    setExpanded((v) => !v);
  }

  return (
    <div className="border-b bg-card">
      {/* Collapsed bar */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="flex items-center justify-between px-5 h-9 cursor-pointer select-none"
      >
        {/* Left: dot + title + date */}
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary shrink-0" aria-hidden />
          <span className="text-xs font-semibold text-foreground">
            Morning Briefing
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh briefing"
          >
            <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            · {today}
          </span>
          {generatedTime && (
            <span className="text-[10px] font-mono text-muted-foreground/60">
              · Generated at {generatedTime}
            </span>
          )}
        </div>

        {/* Right: alerts + chevron + dismiss */}
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {alertCount} alert{alertCount === 1 ? "" : "s"}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground/60 transition-transform duration-150",
              expanded && "rotate-180"
            )}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleDismiss}
            aria-label="Dismiss briefing"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t px-5 py-3">
          <ul className="flex flex-col gap-1.5">
            {content.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="shrink-0 mt-0.5">{item.icon}</span>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="hover:underline underline-offset-2 text-muted-foreground"
                  >
                    {item.text}
                  </Link>
                ) : (
                  <span>{item.text}</span>
                )}
              </li>
            ))}
          </ul>

          {content.oneThing && (
            <>
              <Separator className="my-3" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium text-primary">
                  {content.oneThing}
                </p>
                {content.oneThingHref && (
                  <Link href={content.oneThingHref} className="shrink-0 inline-flex items-center h-5 px-2 rounded-sm bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/80 transition-colors">
                    Go →
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
