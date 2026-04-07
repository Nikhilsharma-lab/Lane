"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  type: "assigned" | "comment" | "stage";
  requestId: string;
  requestTitle: string;
  body: string;
  createdAt: string;
  forYou: boolean;
}

interface AlertItem {
  id: string;
  type: "stall_nudge" | "stall_escalation" | "signoff_overdue" | "figma_drift";
  urgency: "low" | "medium" | "high";
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  generatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const notifTypeIcon: Record<string, string> = {
  assigned: "→",
  comment: "↩",
  stage: "⭢",
};

const urgencyColor: Record<string, string> = {
  high: "var(--color-red, #ef4444)",
  medium: "var(--color-amber, #f59e0b)",
  low: "var(--color-green, #22c55e)",
};

// ── Component ──────────────────────────────────────────────────────────────

export function NotificationsBell({ userRole }: { userRole?: string }) {
  const [open, setOpen] = useState(false);
  // Leads default to alerts tab, everyone else to activity
  const isLead = userRole === "lead" || userRole === "admin";
  const [activeTab, setActiveTab] = useState<"alerts" | "activity">(
    isLead ? "alerts" : "activity"
  );

  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [alertItems, setAlertItems] = useState<AlertItem[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [_seenNotifs, setSeenNotifs] = useState<Set<string>>(new Set());

  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Load alert count silently on mount (for badge)
  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d) => setAlertCount(d.unreadCount ?? 0))
      .catch(() => {});
  }, []);

  function handleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);

    Promise.all([
      fetch("/api/alerts").then((r) => r.json()),
      fetch("/api/notifications").then((r) => r.json()),
    ])
      .then(([alertData, notifData]) => {
        const fetchedAlerts: AlertItem[] = alertData.alerts ?? [];
        const fetchedNotifs: NotificationItem[] = notifData.items ?? [];
        setAlertItems(fetchedAlerts);
        setAlertCount(fetchedAlerts.length);
        setNotifItems(fetchedNotifs);
        setSeenNotifs(new Set(fetchedNotifs.map((i) => i.id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleDismiss(alertId: string) {
    // Optimistic update
    setAlertItems((prev) => prev.filter((a) => a.id !== alertId));
    setAlertCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`/api/alerts/${alertId}/dismiss`, { method: "POST" });
    } catch {
      // silent fail — alert will reappear on next load if dismiss failed
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1"
        aria-label="Notifications"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.5L2 10h12l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5z" />
          <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
        </svg>
        {alertCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[var(--accent)] rounded-full text-[8px] text-[var(--accent-text)] flex items-center justify-center font-medium">
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-8 w-80 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {(["alerts", "activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {tab === "alerts" ? (
                  <>
                    Alerts
                    {alertCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-[var(--accent)] text-[var(--accent-text)] rounded-full text-[9px]">
                        {alertCount}
                      </span>
                    )}
                  </>
                ) : (
                  "Activity"
                )}
              </button>
            ))}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-6">
                <span className="w-3 h-3 border-2 border-[var(--border-strong)] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[var(--text-tertiary)]">Loading…</span>
              </div>
            ) : activeTab === "alerts" ? (
              /* ── Alerts tab ── */
              alertItems.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] px-4 py-6 text-center">
                  No alerts — all clear.
                </p>
              ) : (
                alertItems.map((alert) => (
                  <div
                    key={alert.id}
                    className="px-4 py-3 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="flex items-start gap-2">
                      {/* Urgency dot */}
                      <span
                        className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ backgroundColor: urgencyColor[alert.urgency] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">
                            {alert.title}
                          </p>
                          <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                            {timeAgo(alert.generatedAt)}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                          {alert.body}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Link
                            href={alert.ctaUrl}
                            onClick={() => setOpen(false)}
                            className="text-[10px] font-medium text-[var(--accent)] hover:underline"
                          >
                            {alert.ctaLabel}
                          </Link>
                          <span className="text-[var(--border-strong)]">·</span>
                          <button
                            onClick={() => handleDismiss(alert.id)}
                            className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              /* ── Activity tab ── */
              notifItems.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] px-4 py-6 text-center">
                  No activity yet
                </p>
              ) : (
                notifItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dashboard/requests/${item.requestId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors border-b border-[var(--border)] last:border-0"
                  >
                    <span className="text-xs text-[var(--text-secondary)] mt-0.5 w-4 shrink-0">
                      {notifTypeIcon[item.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-primary)] truncate font-medium">
                        {item.requestTitle}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                        {item.body}
                      </p>
                    </div>
                    <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 mt-0.5">
                      {timeAgo(item.createdAt)}
                    </span>
                  </Link>
                ))
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
