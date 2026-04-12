"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DevPhasePanel } from "@/components/requests/dev-phase-panel";
import { SectionLabel } from "@/components/ui/section-label";
import { PRIORITY_BADGE } from "@/lib/theme-colors";
import type { CardData } from "./types";

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
        className="fixed inset-0 bg-foreground/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-card border-l border z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border sticky top-0 bg-card">
          <span className="text-sm font-semibold text-foreground truncate pr-4">
            {card.title}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0 text-xl leading-none"
          >
            ×
          </Button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Dev Phase Panel — handles its own kanban state + move buttons */}
          <DevPhasePanel
            requestId={card.id}
            kanbanState={card.kanbanState}
            figmaUrl={card.figmaUrl}
            figmaLockedAt={card.figmaLockedAt}
            devQuestionCount={0}
          />

          {/* Description */}
          <section>
            <SectionLabel>
              Description
            </SectionLabel>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {card.description}
            </p>
          </section>

          {card.businessContext && (
            <section>
              <SectionLabel>
                Business Context
              </SectionLabel>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {card.businessContext}
              </p>
            </section>
          )}

          {/* Meta fields */}
          <section className="space-y-3">
            {card.assignees.length > 0 && (
              <div>
                <SectionLabel className="mb-1">
                  Assignees
                </SectionLabel>
                <p className="text-xs text-muted-foreground">{card.assignees.join(", ")}</p>
              </div>
            )}

            {card.priority && (
              <div>
                <SectionLabel className="mb-1">
                  Priority
                </SectionLabel>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                    PRIORITY_BADGE[card.priority] ?? ""
                  }`}
                >
                  {card.priority.toUpperCase()}
                </span>
              </div>
            )}

            {card.deadlineAt && (
              <div>
                <SectionLabel className="mb-1">
                  Deadline
                </SectionLabel>
                <p className="text-xs text-muted-foreground">
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
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary transition-colors"
          >
            View full details →
          </Link>
        </div>
      </div>
    </>
  );
}
