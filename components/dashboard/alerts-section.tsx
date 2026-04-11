"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert";

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

const urgencyIcon: Record<string, typeof AlertTriangle> = {
  high: AlertCircle,
  medium: AlertTriangle,
  low: Info,
};

const INLINE_LIMIT = 3;

export function AlertsSection({ alerts: initial }: Props) {
  const [alerts, setAlerts] = useState(initial);

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
            className="text-muted-foreground/60"
            onClick={handleDismissAll}
          >
            Dismiss all
          </Button>
        </div>
      )}

      {visible.map((alert) => {
        const Icon = urgencyIcon[alert.urgency] ?? Info;
        return (
          <Alert
            key={alert.id}
            variant={alert.urgency === "high" ? "destructive" : "default"}
          >
            <Icon className="size-4" />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>
              {alert.body}
              <div className="mt-2">
                <Link
                  href={alert.ctaUrl}
                  className="font-medium text-foreground underline underline-offset-3 hover:opacity-80"
                >
                  {alert.ctaLabel} →
                </Link>
              </div>
            </AlertDescription>
            <AlertAction>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleDismiss(alert.id)}
                aria-label="Dismiss alert"
                className="text-muted-foreground/60"
              >
                <X className="size-3" />
              </Button>
            </AlertAction>
          </Alert>
        );
      })}

      {overflow > 0 && (
        <Button
          variant="link"
          size="xs"
          className="text-muted-foreground/60 justify-start px-0"
          onClick={() => {}}
        >
          View all {alerts.length} alerts →
        </Button>
      )}
    </div>
  );
}
