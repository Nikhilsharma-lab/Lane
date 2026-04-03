// components/requests/context-brief-panel.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RequestContextBrief } from "@/db/schema";

type Props = {
  requestId: string;
  existingBrief: RequestContextBrief | null;
};

export function ContextBriefPanel({ requestId, existingBrief }: Props) {
  const [brief, setBrief] = useState<RequestContextBrief | null>(existingBrief);
  const [loading, setLoading] = useState(existingBrief === null);

  useEffect(() => {
    if (existingBrief !== null) return; // already have it, skip

    fetch(`/api/requests/${requestId}/context-brief`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.brief) setBrief(data.brief);
      })
      .catch(() => {
        // silent fail — brief is non-blocking
      })
      .finally(() => setLoading(false));
  }, [requestId, existingBrief]);

  if (loading) {
    return (
      <section className="border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            AI Context Brief
          </span>
        </div>
        <div className="p-5 space-y-4 animate-pulse">
          <div className="h-3 bg-zinc-800 rounded w-3/4" />
          <div className="h-3 bg-zinc-800 rounded w-1/2" />
          <div className="h-3 bg-zinc-800 rounded w-5/6" />
          <div className="h-3 bg-zinc-800 rounded w-2/3" />
        </div>
      </section>
    );
  }

  if (!brief) return null; // silent fail

  return (
    <section className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          AI Context Brief
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">{brief.aiModel}</span>
      </div>

      <div className="p-5 space-y-5">
        {/* What this actually means */}
        <div>
          <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">
            What this actually means
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{brief.plainSummary}</p>
        </div>

        {/* Related past work */}
        {brief.relatedRequests.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Related past work
            </div>
            <div className="space-y-1.5">
              {brief.relatedRequests.map((r) => (
                <Link
                  key={r.id}
                  href={`/dashboard/requests/${r.id}`}
                  className="block text-xs border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700 transition-colors"
                >
                  <span className="text-zinc-300">{r.title}</span>
                  <span className="text-zinc-600 ml-2">{r.reason}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Key constraints */}
        {brief.keyConstraints.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Key constraints
            </div>
            <ul className="space-y-1.5">
              {brief.keyConstraints.map((c, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-orange-400 shrink-0">—</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Questions to ask */}
        {brief.questionsToAsk.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Questions to ask before starting
            </div>
            <ul className="space-y-1.5">
              {brief.questionsToAsk.map((q, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-indigo-400 shrink-0">?</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Exploration directions */}
        {brief.explorationDirections.length > 0 && (
          <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
              Exploration directions
            </div>
            <ul className="space-y-1.5">
              {brief.explorationDirections.map((d, i) => (
                <li key={i} className="text-xs text-zinc-400 flex gap-2">
                  <span className="text-emerald-400 shrink-0">→</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
