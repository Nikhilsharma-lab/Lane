"use client";

import { useState, useCallback } from "react";
import { saveNotificationPreferences } from "@/app/actions/notification-preferences";
import type { NotificationPreference } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
  { label: "Stage Changes", inAppKey: "stageChangesInApp", emailKey: "stageChangesEmail" },
  { label: "Mentions", inAppKey: "mentionsInApp", emailKey: "mentionsEmail" },
  { label: "Weekly Digest", inAppKey: null, emailKey: "weeklyDigestEmail" },
  { label: "Morning Briefing", inAppKey: "morningBriefingInApp", emailKey: null },
];

export function NotificationPrefsForm({ initialPrefs }: NotificationPrefsFormProps) {
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
      saveNotificationPreferences({ [key]: value });
    },
    []
  );

  function handleReset() {
    setPrefs({ ...DEFAULTS });
    saveNotificationPreferences({ ...DEFAULTS });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Channels</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_80px] gap-0 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Category
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 text-center">
            In-App
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 text-center">
            Email
          </span>
        </div>
        <Separator />

        {/* Rows */}
        {ROWS.map((row) => (
          <div key={row.label}>
            <div className="grid grid-cols-[1fr_80px_80px] gap-0 items-center py-3">
              <span className="text-sm font-medium text-foreground">
                {row.label}
              </span>

              {/* In-App toggle */}
              <div className="flex justify-center">
                {row.inAppKey ? (
                  <Switch
                    checked={prefs[row.inAppKey]}
                    onCheckedChange={(v) => handleToggle(row.inAppKey!, v)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground/60">--</span>
                )}
              </div>

              {/* Email toggle */}
              <div className="flex justify-center">
                {row.emailKey ? (
                  <Switch
                    checked={prefs[row.emailKey]}
                    onCheckedChange={(v) => handleToggle(row.emailKey!, v)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground/60">--</span>
                )}
              </div>
            </div>
            <Separator />
          </div>
        ))}

        {/* Reset button */}
        <div className="mt-5">
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
