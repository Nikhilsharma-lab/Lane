"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Sparkles } from "lucide-react";

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

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  p0: { bg: "rgba(197,48,48,0.12)", text: "#c53030" },
  p1: { bg: "rgba(221,107,32,0.12)", text: "#dd6b20" },
  p2: { bg: "rgba(212,168,75,0.12)", text: "#9a6b12" },
  p3: { bg: "rgba(134,168,122,0.12)", text: "#4a7a40" },
};

type Tab = "pending" | "reviewed";

export function IntakeSidebar({ requests, activeId, onSelect }: IntakeSidebarProps) {
  const [tab, setTab] = useState<Tab>("pending");
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const filtered = requests.filter((r) =>
    tab === "reviewed" ? r.hasAiAnalysis : !r.hasAiAnalysis
  );

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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: requests.filter((r) => !r.hasAiAnalysis).length },
    { key: "reviewed", label: "Reviewed", count: requests.filter((r) => r.hasAiAnalysis).length },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRight: "1px solid hsl(var(--border))",
        background: "hsl(var(--card))",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 0",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "hsl(var(--foreground))",
            }}
          >
            Intake
          </span>
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "hsl(var(--muted-foreground) / 0.6)",
            }}
          >
            {requests.length}
          </span>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            marginTop: 10,
            borderBottom: "1px solid hsl(var(--border))",
          }}
        >
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  fontFamily: "'Geist Mono', monospace",
                  fontWeight: active ? 600 : 400,
                  color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground) / 0.6)",
                  background: "transparent",
                  border: "none",
                  borderBottom: active ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "color 0.1s",
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    style={{
                      marginLeft: 4,
                      fontSize: 9,
                      color: "hsl(var(--muted-foreground) / 0.6)",
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Request list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 12,
                color: "hsl(var(--muted-foreground) / 0.6)",
              }}
            >
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
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  width: "100%",
                  padding: "10px 16px",
                  textAlign: "left",
                  background: isActive ? "hsl(var(--primary) / 0.1)" : "transparent",
                  borderLeft: isActive ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                  border: "none",
                  borderBottom: "1px solid hsl(var(--border))",
                  borderLeftWidth: 2,
                  borderLeftStyle: "solid",
                  borderLeftColor: isActive ? "hsl(var(--primary))" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "hsl(var(--accent))";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Title row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontFamily: "'Geist', sans-serif",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "hsl(var(--foreground))",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {r.title}
                  </span>
                  {r.hasAiAnalysis && (
                    <Sparkles size={11} style={{ color: "hsl(var(--primary))", flexShrink: 0 }} />
                  )}
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {r.priority && (
                    <span
                      style={{
                        display: "inline-flex",
                        padding: "1px 4px",
                        borderRadius: 3,
                        fontSize: 9,
                        fontWeight: 600,
                        fontFamily: "'Geist Mono', monospace",
                        background: PRIORITY_COLORS[r.priority]?.bg ?? "hsl(var(--accent))",
                        color: PRIORITY_COLORS[r.priority]?.text ?? "hsl(var(--muted-foreground) / 0.6)",
                      }}
                    >
                      {r.priority.toUpperCase()}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      color: "hsl(var(--muted-foreground) / 0.6)",
                    }}
                  >
                    {r.requesterName}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      color: "hsl(var(--muted-foreground) / 0.6)",
                      marginLeft: "auto",
                    }}
                  >
                    {relativeTime}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Keyboard hints */}
      <div
        style={{
          padding: "6px 16px",
          borderTop: "1px solid hsl(var(--border))",
          display: "flex",
          gap: 12,
          flexShrink: 0,
        }}
      >
        {["J/K navigate"].map((hint) => (
          <span
            key={hint}
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "hsl(var(--muted-foreground) / 0.6)",
            }}
          >
            {hint}
          </span>
        ))}
      </div>
    </div>
  );
}
