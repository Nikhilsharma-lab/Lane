// components/requests/prediction-confidence-panel.tsx
"use client";

import { useEffect, useState } from "react";
import type { PredictionConfidence } from "@/db/schema";

type Props = {
  requestId: string;
  existingConfidence: PredictionConfidence | null;
};

const LABEL_CONFIG: Record<
  string,
  { text: string; ringColor: string; textColor: string; bgColor: string }
> = {
  realistic:     { text: "Realistic prediction",  ringColor: "stroke-green-400",   textColor: "text-green-400",   bgColor: "bg-green-500/5 border-green-500/15" },
  optimistic:    { text: "Over-optimistic",        ringColor: "stroke-amber-400",   textColor: "text-amber-400",   bgColor: "bg-amber-500/5 border-amber-500/15" },
  vague:         { text: "Vague metric",           ringColor: "stroke-orange-400",  textColor: "text-orange-400",  bgColor: "bg-orange-500/5 border-orange-500/15" },
  unmeasurable:  { text: "Unmeasurable",           ringColor: "stroke-red-400",     textColor: "text-red-400",     bgColor: "bg-red-500/5 border-red-500/15" },
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  const cfg = LABEL_CONFIG[label] ?? LABEL_CONFIG.vague;
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex items-center gap-3 shrink-0">
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--bg-hover)" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={r} fill="none"
          className={cfg.ringColor}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className={`text-lg font-semibold font-mono leading-none ${cfg.textColor}`}>{score}</p>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">/ 100</p>
      </div>
    </div>
  );
}

export function PredictionConfidencePanel({ requestId, existingConfidence }: Props) {
  const [confidence, setConfidence] = useState<PredictionConfidence | null>(existingConfidence);
  const [loading, setLoading] = useState(existingConfidence === null);

  useEffect(() => {
    if (existingConfidence !== null) return;

    fetch(`/api/requests/${requestId}/prediction-confidence`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => { if (data.confidence) setConfidence(data.confidence); })
      .catch(() => { /* silent fail */ })
      .finally(() => setLoading(false));
  }, [requestId, existingConfidence]);

  if (loading) {
    return (
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            Prediction Confidence
          </span>
        </div>
        <div className="p-4 space-y-3 animate-pulse">
          <div className="flex gap-3">
            <div className="w-13 h-13 rounded-full bg-[var(--bg-hover)]" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-[var(--bg-hover)] rounded w-1/2" />
              <div className="h-3 bg-[var(--bg-hover)] rounded w-3/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!confidence) return null;

  const cfg = LABEL_CONFIG[confidence.label] ?? LABEL_CONFIG.vague;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Prediction Confidence
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{confidence.aiModel}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Score ring + label */}
        <div className="flex items-center gap-4">
          <ScoreRing score={confidence.score} label={confidence.label} />
          <div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${cfg.bgColor} ${cfg.textColor}`}>
              {cfg.text}
            </span>
            <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">{confidence.rationale}</p>
          </div>
        </div>

        {/* Red flags */}
        {confidence.redFlags.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Issues</div>
            <ul className="space-y-1.5">
              {confidence.redFlags.map((flag, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-red-400 shrink-0">!</span>
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestion */}
        {confidence.suggestion && (
          <p className="text-xs text-[var(--text-tertiary)] border-t border-[var(--border)] pt-3">
            {confidence.suggestion}
          </p>
        )}
      </div>
    </div>
  );
}
