// components/requests/handoff-brief-panel.tsx
"use client";

import { useEffect, useState } from "react";
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
      .catch(() => { /* silent fail — brief is non-blocking */ })
      .finally(() => setLoading(false));
  }, [requestId, existingBrief]);

  if (loading) {
    return (
      <section className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            AI Handoff Brief
          </span>
        </div>
        <div className="p-5 space-y-4 animate-pulse">
          <div className="h-3 bg-[var(--bg-hover)] rounded w-3/4" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-1/2" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-5/6" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-2/3" />
        </div>
      </section>
    );
  }

  if (!brief) return null;

  return (
    <section className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          AI Handoff Brief
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{brief.aiModel}</span>
      </div>

      <div className="p-5 space-y-5">
        {brief.designDecisions.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Design decisions</div>
            <div className="space-y-2.5">
              {brief.designDecisions.map((d, i) => (
                <div key={i} className="border border-[var(--border)] rounded-lg px-3 py-2.5">
                  <p className="text-xs text-[var(--text-primary)] mb-1">{d.decision}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{d.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {brief.openQuestions.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Open questions — flag these back</div>
            <ul className="space-y-1.5">
              {brief.openQuestions.map((q, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-amber-400 shrink-0">?</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {brief.buildSequence.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Build sequence</div>
            <ol className="space-y-1.5">
              {brief.buildSequence.map((step, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-[var(--text-tertiary)] shrink-0 font-mono">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {brief.figmaNotes && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">Figma notes</div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{brief.figmaNotes}</p>
          </div>
        )}

        {brief.edgeCases.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Edge cases to handle</div>
            <ul className="space-y-1.5">
              {brief.edgeCases.map((e, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-[var(--accent)] shrink-0">→</span>
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
