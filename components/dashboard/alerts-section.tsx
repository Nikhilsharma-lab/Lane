"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface AlertItem {
  id: string;
  type: string;
  urgency: "low" | "medium" | "high";
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

interface Props {
  alerts: AlertItem[];
}

const urgencyColors: Record<string, string> = {
  high: "bg-[var(--accent-danger)]",
  medium: "bg-[var(--accent-warning)]",
  low: "bg-border/80",
};

const INLINE_LIMIT = 3;

export function AlertsSection({ alerts: initial }: Props) {
  const [alerts, setAlerts] = useState(initial);
  const [panelOpen, setPanelOpen] = useState(false);

  if (alerts.length === 0) return null;

  const visible = alerts.slice(0, INLINE_LIMIT);
  const overflow = alerts.length - INLINE_LIMIT;

  async function handleDismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`/api/alerts/${id}/dismiss`, { method: "POST" });
    } catch {
      // silent fail
    }
  }

  async function handleDismissAll() {
    const ids = alerts.map((a) => a.id);
    setAlerts([]);
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/alerts/${id}/dismiss`, { method: "POST" }))
      );
    } catch {
      // silent fail
    }
  }

  return (
    <div className="mb-5 flex flex-col gap-2">
      {alerts.length >= 2 && (
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60">
            Alerts
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground/60 font-mono"
            onClick={handleDismissAll}
          >
            Dismiss all
          </Button>
        </div>
      )}

      {visible.map((alert) => (
        <div
          key={alert.id}
          className="rounded-xl overflow-hidden flex border bg-muted"
        >
          {/* Urgency bar */}
          <div className={`w-1 shrink-0 ${urgencyColors[alert.urgency]}`} />

          <div className="flex-1 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground leading-snug">
                {alert.title}
              </p>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleDismiss(alert.id)}
                aria-label="Dismiss alert"
                className="shrink-0 text-muted-foreground/60"
              >
                <X className="size-3" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {alert.body}
            </p>

            <div className="mt-2.5">
              <Link
                href={alert.ctaUrl}
                className="text-xs font-medium text-primary hover:opacity-80 transition-opacity"
              >
                {alert.ctaLabel} →
              </Link>
            </div>
          </div>
        </div>
      ))}

      {overflow > 0 && (
        <Button
          variant="link"
          size="xs"
          className="text-muted-foreground/60 justify-start px-0"
          onClick={() => setPanelOpen(true)}
        >
          View all {alerts.length} alerts →
        </Button>
      )}
    </div>
  );
}
