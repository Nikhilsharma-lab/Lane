"use client";

import { useState, useCallback } from "react";
import { saveNotificationPreferences } from "@/app/actions/notification-preferences";
import type { NotificationPreference } from "@/db/schema";

// Default values matching the DB schema defaults
const DEFAULTS: PrefsState = {
  nudgesInApp: true,
  nudgesEmail: false,
  commentsInApp: true,
  commentsEmail: true,
  stageChangesInApp: true,
  stageChangesEmail: false,
  mentionsInApp: true,
  mentionsEmail: true,
  weeklyDigestEmail: true,
  morningBriefingInApp: true,
};

type PrefsState = {
  nudgesInApp: boolean;
  nudgesEmail: boolean;
  commentsInApp: boolean;
  commentsEmail: boolean;
  stageChangesInApp: boolean;
  stageChangesEmail: boolean;
  mentionsInApp: boolean;
  mentionsEmail: boolean;
  weeklyDigestEmail: boolean;
  morningBriefingInApp: boolean;
};

interface NotificationPrefsFormProps {
  initialPrefs: NotificationPreference | null;
}

interface RowConfig {
  label: string;
  inAppKey: keyof PrefsState | null;
  emailKey: keyof PrefsState | null;
}

const ROWS: RowConfig[] = [
  { label: "AI Nudges", inAppKey: "nudgesInApp", emailKey: "nudgesEmail" },
  { label: "Comments", inAppKey: "commentsInApp", emailKey: "commentsEmail" },
  {
    label: "Stage Changes",
    inAppKey: "stageChangesInApp",
    emailKey: "stageChangesEmail",
  },
  { label: "Mentions", inAppKey: "mentionsInApp", emailKey: "mentionsEmail" },
  { label: "Weekly Digest", inAppKey: null, emailKey: "weeklyDigestEmail" },
  {
    label: "Morning Briefing",
    inAppKey: "morningBriefingInApp",
    emailKey: null,
  },
];

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? "var(--primary)" : "var(--accent)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.15s ease",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}

export function NotificationPrefsForm({
  initialPrefs,
}: NotificationPrefsFormProps) {
  const [prefs, setPrefs] = useState<PrefsState>(() => {
    if (!initialPrefs) return { ...DEFAULTS };
    return {
      nudgesInApp: initialPrefs.nudgesInApp,
      nudgesEmail: initialPrefs.nudgesEmail,
      commentsInApp: initialPrefs.commentsInApp,
      commentsEmail: initialPrefs.commentsEmail,
      stageChangesInApp: initialPrefs.stageChangesInApp,
      stageChangesEmail: initialPrefs.stageChangesEmail,
      mentionsInApp: initialPrefs.mentionsInApp,
      mentionsEmail: initialPrefs.mentionsEmail,
      weeklyDigestEmail: initialPrefs.weeklyDigestEmail,
      morningBriefingInApp: initialPrefs.morningBriefingInApp,
    };
  });

  const handleToggle = useCallback(
    (key: keyof PrefsState, value: boolean) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      // Fire-and-forget save
      saveNotificationPreferences({ [key]: value });
    },
    []
  );

  function handleReset() {
    setPrefs({ ...DEFAULTS });
    saveNotificationPreferences({ ...DEFAULTS });
  }

  return (
    <div>
      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 80px",
          gap: 0,
          padding: "0 0 8px 0",
          borderBottom: "1px solid hsl(var(--border))",
          marginBottom: 4,
        }}
      >
        <span
          className="text-muted-foreground/60"
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Category
        </span>
        <span
          className="text-muted-foreground/60"
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            textAlign: "center",
          }}
        >
          In-App
        </span>
        <span
          className="text-muted-foreground/60"
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            textAlign: "center",
          }}
        >
          Email
        </span>
      </div>

      {/* Rows */}
      {ROWS.map((row) => (
        <div
          key={row.label}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px",
            gap: 0,
            alignItems: "center",
            padding: "12px 0",
            borderBottom: "1px solid hsl(var(--border))",
          }}
        >
          <span
            className="text-foreground"
            style={{
              fontSize: 13,
              fontWeight: 480,
            }}
          >
            {row.label}
          </span>

          {/* In-App toggle */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            {row.inAppKey ? (
              <Toggle
                checked={prefs[row.inAppKey]}
                onChange={(v) => handleToggle(row.inAppKey!, v)}
              />
            ) : (
              <span
                className="text-muted-foreground/60"
                style={{
                  fontSize: 12,
                }}
              >
                --
              </span>
            )}
          </div>

          {/* Email toggle */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            {row.emailKey ? (
              <Toggle
                checked={prefs[row.emailKey]}
                onChange={(v) => handleToggle(row.emailKey!, v)}
              />
            ) : (
              <span
                className="text-muted-foreground/60"
                style={{
                  fontSize: 12,
                }}
              >
                --
              </span>
            )}
          </div>
        </div>
      ))}

      {/* Reset button */}
      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          onClick={handleReset}
          className="text-muted-foreground bg-muted border border-border"
          style={{
            fontSize: 13,
            fontWeight: 520,
            cursor: "pointer",
            padding: "6px 14px",
            borderRadius: 6,
            transition: "all 0.15s ease",
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
