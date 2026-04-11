"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
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

  if (!brief || brief.dismissedAt || dismissed) return null;

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
      if (!res.ok) setDismissed(false); // rollback
    } catch {
      setDismissed(false); // rollback
    }
  }

  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation();
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch("/api/morning-briefing", { method: "POST" });
      window.location.reload();
    } catch {
      setRefreshing(false);
    }
  }

  function toggle() {
    setExpanded((v) => !v);
  }

  return (
    <div
      style={{
        borderBottom: "1px solid hsl(var(--border))",
        background: "hsl(var(--card))",
      }}
    >
      {/* ── Collapsed bar ─────────────────────────────────────────────── */}
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
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 36,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Left: dot + title + date */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "hsl(var(--primary))",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: "hsl(var(--foreground))",
            }}
          >
            Morning Briefing
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh briefing"
            style={{
              width: 20,
              height: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "none",
              background: "transparent",
              color: "hsl(var(--muted-foreground) / 0.6)",
              cursor: refreshing ? "not-allowed" : "pointer",
              padding: 0,
            }}
            className="hover:opacity-70"
            disabled={refreshing}
          >
            <RefreshCw
              size={11}
              style={{
                animation: refreshing ? "spin 1s linear infinite" : undefined,
              }}
            />
          </button>
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "hsl(var(--muted-foreground) / 0.6)",
            }}
          >
            · {today}
          </span>
          {generatedTime && (
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: "hsl(var(--muted-foreground) / 0.6)",
              }}
            >
              · Generated at {generatedTime}
            </span>
          )}
        </div>

        {/* Right: alerts · chevron · dismiss */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {alertCount > 0 && (
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "hsl(var(--muted))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              {alertCount} alert{alertCount === 1 ? "" : "s"}
            </span>
          )}
          <span
            aria-hidden
            style={{
              display: "inline-block",
              fontSize: 9,
              lineHeight: 1,
              color: "hsl(var(--muted-foreground) / 0.6)",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
            }}
          >
            ▾
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss briefing"
            style={{
              width: 20,
              height: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "none",
              background: "transparent",
              color: "hsl(var(--muted-foreground) / 0.6)",
              fontSize: 13,
              cursor: "pointer",
            }}
            className="hover:opacity-70"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Expanded body ─────────────────────────────────────────────── */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid hsl(var(--border))",
            padding: "12px 20px 14px",
          }}
        >
          <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {content.items.map((item, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontFamily: "'Geist', sans-serif",
                  fontSize: 12,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                <span style={{ flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="hover:underline underline-offset-2"
                    style={{ color: "hsl(var(--muted-foreground))" }}
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
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid hsl(var(--border))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <p
                style={{
                  fontFamily: "'Geist', sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "hsl(var(--primary))",
                  margin: 0,
                }}
              >
                {content.oneThing}
              </p>
              {content.oneThingHref && (
                <Link
                  href={content.oneThingHref}
                  className="hover:opacity-80"
                  style={{
                    flexShrink: 0,
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "hsl(var(--primary))",
                    color: "#fff",
                  }}
                >
                  Go →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
