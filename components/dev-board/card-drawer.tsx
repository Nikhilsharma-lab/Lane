"use client";

import { useEffect } from "react";
import Link from "next/link";
import { DevPhasePanel } from "@/components/requests/dev-phase-panel";
import type { CardData } from "./types";

const PRIORITY_COLORS: Record<string, string> = {
  p0: "bg-red-500/15 text-red-400 border-red-500/20",
  p1: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  p2: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  p3: "bg-zinc-700/50 text-zinc-400 border-zinc-700",
};

interface Props {
  card: CardData;
  onClose: () => void;
}

export function CardDrawer({ card, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-zinc-950 border-l border-zinc-800 z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950">
          <span className="text-sm font-semibold text-zinc-200 truncate pr-4">
            {card.title}
          </span>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Dev Phase Panel — handles its own kanban state + move buttons */}
          <DevPhasePanel
            requestId={card.id}
            kanbanState={card.kanbanState}
            figmaUrl={card.figmaUrl}
            figmaLockedAt={card.figmaLockedAt}
          />

          {/* Description */}
          <section>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">
              Description
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
              {card.description}
            </p>
          </section>

          {card.businessContext && (
            <section>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">
                Business Context
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                {card.businessContext}
              </p>
            </section>
          )}

          {/* Meta fields */}
          <section className="space-y-3">
            {card.assignees.length > 0 && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
                  Assignees
                </div>
                <p className="text-xs text-zinc-400">{card.assignees.join(", ")}</p>
              </div>
            )}

            {card.priority && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
                  Priority
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                    PRIORITY_COLORS[card.priority] ?? ""
                  }`}
                >
                  {card.priority.toUpperCase()}
                </span>
              </div>
            )}

            {card.deadlineAt && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
                  Deadline
                </div>
                <p className="text-xs text-zinc-400">
                  {new Date(card.deadlineAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
          </section>

          {/* Link to full request detail */}
          <Link
            href={`/dashboard/requests/${card.id}`}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View full details →
          </Link>
        </div>
      </div>
    </>
  );
}
