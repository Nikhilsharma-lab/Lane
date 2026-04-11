"use client";

import { useState } from "react";
import Link from "next/link";

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

const urgencyBorder: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "hsl(var(--border) / 0.8)",
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
      // silent fail — badge in bell will still show on next load
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
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "hsl(var(--muted-foreground) / 0.6)",
            }}
          >
            Alerts
          </span>
          <button
            onClick={handleDismissAll}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "hsl(var(--muted-foreground) / 0.6)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Dismiss all
          </button>
        </div>
      )}
      {visible.map((alert) => (
        <div
          key={alert.id}
          className="rounded-xl overflow-hidden flex"
          style={{
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--muted))",
          }}
        >
          {/* Urgency bar */}
          <div
            className="w-1 shrink-0"
            style={{ background: urgencyBorder[alert.urgency] }}
          />

          <div className="flex-1 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-snug" style={{ color: "hsl(var(--foreground))" }}>
                {alert.title}
              </p>
              <button
                onClick={() => handleDismiss(alert.id)}
                className="shrink-0 text-xs leading-none hover:opacity-70 transition-opacity mt-0.5"
                style={{ color: "hsl(var(--muted-foreground) / 0.6)", background: "none", border: "none", cursor: "pointer" }}
                aria-label="Dismiss alert"
              >
                ×
              </button>
            </div>

            <p className="text-xs mt-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              {alert.body}
            </p>

            <div className="mt-2.5">
              <Link
                href={alert.ctaUrl}
                className="text-xs font-medium hover:opacity-80 transition-opacity"
                style={{ color: "hsl(var(--primary))" }}
              >
                {alert.ctaLabel} →
              </Link>
            </div>
          </div>
        </div>
      ))}

      {overflow > 0 && (
        <button
          onClick={() => setPanelOpen(true)}
          className="text-xs text-left hover:opacity-70 transition-opacity"
          style={{ color: "hsl(var(--muted-foreground) / 0.6)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          View all {alerts.length} alerts →
        </button>
      )}
    </div>
  );
}
