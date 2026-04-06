// components/requests/impact-retrospective-panel.tsx
"use client";

import { useEffect, useState } from "react";
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
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            What We Learned
          </span>
        </div>
        <div className="p-4 space-y-3 animate-pulse">
          <div className="h-4 bg-[var(--bg-hover)] rounded w-1/2" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-full" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-3/4" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!retro) return null;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          What We Learned
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{retro.aiModel}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Celebrate callout (over-delivered only) */}
        {retro.celebrate && (
          <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <span className="text-green-400 text-xs mt-0.5">★</span>
            <p className="text-xs text-green-400/90 leading-relaxed">{retro.celebrate}</p>
          </div>
        )}

        {/* Headline */}
        <p className="text-sm font-medium text-[var(--text-primary)]">{retro.headline}</p>

        {/* What happened */}
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{retro.whatHappened}</p>

        {/* Likely reasons */}
        {retro.likelyReasons.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Likely reasons</div>
            <ul className="space-y-1.5">
              {retro.likelyReasons.map((reason, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-[var(--text-tertiary)] shrink-0">—</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next time suggestion */}
        <p className="text-xs text-[var(--text-tertiary)] border-t border-[var(--border)] pt-3 leading-relaxed">
          <span className="text-[var(--accent)] font-medium">Next time:</span>{" "}
          {retro.nextTimeSuggestion}
        </p>
      </div>
    </div>
  );
}
