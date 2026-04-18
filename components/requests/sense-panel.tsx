"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveSensingSummary } from "@/app/actions/design-stages";
import { ContextBriefPanel } from "./context-brief-panel";

interface SensePanelProps {
  requestId: string;
  initialSummary: string | null;
}

export function SensePanel({ requestId, initialSummary }: SensePanelProps) {
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [saved, setSaved] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSaved(summary === (initialSummary ?? ""));
  }, [summary, initialSummary]);

  function handleSave() {
    startTransition(async () => {
      await saveSensingSummary(requestId, summary);
      setSaved(true);
    });
  }

  function handleBlur() {
    if (!saved && summary.trim()) {
      handleSave();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">
          Sensing summary
        </label>
        <p className="text-[11px] text-muted-foreground">
          What are you noticing? What patterns, research, or past decisions
          are relevant? Write what you&apos;re learning — not conclusions yet.
        </p>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={handleBlur}
          placeholder="Deep understanding before proposing anything..."
          rows={6}
          className="text-xs resize-y"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50">
            {saved ? "Saved" : "Unsaved changes"}
          </span>
          {!saved && (
            <Button
              variant="secondary"
              size="xs"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      <ContextBriefPanel requestId={requestId} existingBrief={null} />
    </div>
  );
}
