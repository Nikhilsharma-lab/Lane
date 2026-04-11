"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

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
  high: "var(--accent-danger)",
  medium: "var(--accent-warning)",
  low: "var(--accent-success)",
};

// ── Component ──────────────────────────────────────────────────────────────

export function NotificationsBell({ userRole }: { userRole?: string }) {
  const [open, setOpen] = useState(false);
  const isLead = userRole === "lead" || userRole === "admin";
  const defaultTab = isLead ? "alerts" : "activity";

  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [alertItems, setAlertItems] = useState<AlertItem[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(false);

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

  // Load alert count silently on mount
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
        setAlertCount(alertData.unreadCount ?? fetchedAlerts.length);
        setNotifItems(fetchedNotifs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleDismiss(alertId: string) {
    const snapshot = alertItems;
    setAlertItems((prev) => prev.filter((a) => a.id !== alertId));
    setAlertCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`/api/alerts/${alertId}/dismiss`, { method: "POST" });
    } catch {
      setAlertItems(snapshot);
      setAlertCount((prev) => prev + 1);
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative"
      >
        <Bell className="size-3.5" />
        {alertCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-3.5 bg-primary rounded-full text-[8px] text-primary-foreground flex items-center justify-center font-medium">
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        )}
      </Button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 bottom-full mb-2 w-80 bg-card border rounded-xl shadow-2xl z-50 overflow-hidden">
          <Tabs defaultValue={defaultTab}>
            <TabsList variant="line" className="w-full border-b">
              <TabsTrigger value="alerts">
                Alerts
                {alertCount > 0 && (
                  <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[9px]">
                    {alertCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity">
                Activity
              </TabsTrigger>
            </TabsList>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 px-4 py-6">
                  <Spinner className="size-3" />
                  <span className="text-xs text-muted-foreground/60">Loading...</span>
                </div>
              ) : (
                <>
                  <TabsContent value="alerts" className="mt-0">
                    {alertItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 px-4 py-6 text-center">
                        No alerts — all clear.
                      </p>
                    ) : (
                      alertItems.map((alert) => (
                        <div key={alert.id} className="px-4 py-3 border-b last:border-0">
                          <div className="flex items-start gap-2">
                            <span
                              className="size-2 rounded-full mt-1 shrink-0"
                              style={{ backgroundColor: urgencyColor[alert.urgency] }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-medium text-foreground leading-snug">
                                  {alert.title}
                                </p>
                                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                  {timeAgo(alert.generatedAt)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {alert.body}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Link
                                  href={alert.ctaUrl}
                                  onClick={() => setOpen(false)}
                                  className="text-[10px] font-medium text-primary hover:underline"
                                >
                                  {alert.ctaLabel}
                                </Link>
                                <span className="text-muted-foreground/60">·</span>
                                <button
                                  onClick={() => handleDismiss(alert.id)}
                                  className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="activity" className="mt-0">
                    {notifItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 px-4 py-6 text-center">
                        No activity yet
                      </p>
                    ) : (
                      notifItems.map((item) => (
                        <Link
                          key={item.id}
                          href={`/dashboard/requests/${item.requestId}`}
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors border-b last:border-0 no-underline"
                        >
                          <span className="text-xs text-muted-foreground mt-0.5 w-4 shrink-0">
                            {notifTypeIcon[item.type]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground truncate font-medium">
                              {item.requestTitle}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {item.body}
                            </p>
                          </div>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
                            {timeAgo(item.createdAt)}
                          </span>
                        </Link>
                      ))
                    )}
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}
