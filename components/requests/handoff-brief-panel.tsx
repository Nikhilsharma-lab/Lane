// components/requests/handoff-brief-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { PanelHeader } from "@/components/ui/panel-header";
import { SectionLabel } from "@/components/ui/section-label";
import type { RequestHandoffBrief } from "@/db/schema";

type Props = {
  requestId: string;
  existingBrief: RequestHandoffBrief | null;
};

export function HandoffBriefPanel({ requestId, existingBrief }: Props) {
  const [brief, setBrief] = useState<RequestHandoffBrief | null>(existingBrief);
  const [loading, setLoading] = useState(existingBrief === null);

  useEffect(() => {
    if (existingBrief !== null) return;

    fetch(`/api/requests/${requestId}/handoff-brief`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.brief) setBrief(data.brief);
      })
      .catch((err) => { console.error("[handoff-brief-panel] fetch handoff brief failed:", err); })
      .finally(() => setLoading(false));
  }, [requestId, existingBrief]);

  if (loading) {
    return (
      <section className="border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            AI Handoff Brief
          </span>
        </div>
        <div className="p-5 space-y-4 animate-pulse">
          <div className="h-3 bg-accent rounded w-3/4" />
          <div className="h-3 bg-accent rounded w-1/2" />
          <div className="h-3 bg-accent rounded w-5/6" />
          <div className="h-3 bg-accent rounded w-2/3" />
        </div>
      </section>
    );
  }

  if (!brief) return null;

  return (
    <section className="border rounded-xl overflow-hidden">
      <PanelHeader>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          AI Handoff Brief
        </span>
        <span className="text-[10px] text-muted-foreground/60 font-mono">{brief.aiModel}</span>
      </PanelHeader>

      <div className="p-5 space-y-5">
        {brief.designDecisions.length > 0 && (
          <div>
            <SectionLabel className="mb-2">Design decisions</SectionLabel>
            <div className="space-y-2.5">
              {brief.designDecisions.map((d, i) => (
                <div key={i} className="border rounded-lg px-3 py-2.5">
                  <p className="text-xs text-foreground mb-1">{d.decision}</p>
                  <p className="text-[11px] text-muted-foreground">{d.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {brief.openQuestions.length > 0 && (
          <div>
            <SectionLabel className="mb-2">Open questions — flag these back</SectionLabel>
            <ul className="space-y-1.5">
              {brief.openQuestions.map((q, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-accent-warning shrink-0">?</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {brief.buildSequence.length > 0 && (
          <div>
            <SectionLabel className="mb-2">Build sequence</SectionLabel>
            <ol className="space-y-1.5">
              {brief.buildSequence.map((step, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-muted-foreground/60 shrink-0 font-mono">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {brief.figmaNotes && (
          <div>
            <SectionLabel>Figma notes</SectionLabel>
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.figmaNotes}</p>
          </div>
        )}

        {brief.edgeCases.length > 0 && (
          <div>
            <SectionLabel className="mb-2">Edge cases to handle</SectionLabel>
            <ul className="space-y-1.5">
              {brief.edgeCases.map((e, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-primary shrink-0">→</span>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
