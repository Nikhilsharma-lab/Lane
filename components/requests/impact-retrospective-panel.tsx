// components/requests/impact-retrospective-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { Callout } from "@/components/ui/callout";
import { PanelHeader } from "@/components/ui/panel-header";
import { SectionLabel } from "@/components/ui/section-label";
import type { ImpactRetrospective } from "@/db/schema";

type Props = {
  requestId: string;
  existingRetrospective: ImpactRetrospective | null;
};

export function ImpactRetrospectivePanel({ requestId, existingRetrospective }: Props) {
  const [retro, setRetro] = useState<ImpactRetrospective | null>(existingRetrospective);
  const [loading, setLoading] = useState(existingRetrospective === null);

  useEffect(() => {
    if (existingRetrospective !== null) return;

    fetch(`/api/requests/${requestId}/impact-retrospective`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => { if (data.retrospective) setRetro(data.retrospective); })
      .catch(() => { /* silent fail */ })
      .finally(() => setLoading(false));
  }, [requestId, existingRetrospective]);

  if (loading) {
    return (
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            What We Learned
          </span>
        </div>
        <div className="p-4 space-y-3 animate-pulse">
          <div className="h-4 bg-accent rounded w-1/2" />
          <div className="h-3 bg-accent rounded w-full" />
          <div className="h-3 bg-accent rounded w-3/4" />
          <div className="h-3 bg-accent rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!retro) return null;

  return (
    <div className="border rounded-xl overflow-hidden">
      <PanelHeader className="px-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          What We Learned
        </span>
        <span className="text-[10px] text-muted-foreground/60 font-mono">{retro.aiModel}</span>
      </PanelHeader>

      <div className="p-4 space-y-4">
        {/* Celebrate callout (over-delivered only) */}
        {retro.celebrate && (
          <Callout variant="success" className="py-2.5 flex items-start gap-2">
            <span className="text-xs mt-0.5">★</span>
            <p className="text-xs leading-relaxed">{retro.celebrate}</p>
          </Callout>
        )}

        {/* Headline */}
        <p className="text-sm font-medium text-foreground">{retro.headline}</p>

        {/* What happened */}
        <p className="text-xs text-muted-foreground leading-relaxed">{retro.whatHappened}</p>

        {/* Likely reasons */}
        {retro.likelyReasons.length > 0 && (
          <div>
            <SectionLabel className="mb-2">Likely reasons</SectionLabel>
            <ul className="space-y-1.5">
              {retro.likelyReasons.map((reason, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-muted-foreground/60 shrink-0">—</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next time suggestion */}
        <p className="text-xs text-muted-foreground/60 border-t pt-3 leading-relaxed">
          <span className="text-primary font-medium">Next time:</span>{" "}
          {retro.nextTimeSuggestion}
        </p>
      </div>
    </div>
  );
}
