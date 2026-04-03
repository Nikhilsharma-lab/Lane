"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./kanban-card";
import type { CardData, KanbanState } from "./types";

interface Props {
  state: KanbanState;
  label: string;
  cards: CardData[];
  focusedCardId: string | null;
  onCardClick: (card: CardData) => void;
  onCardFocus: (id: string) => void;
}

export function KanbanColumn({
  state,
  label,
  cards,
  focusedCardId,
  onCardClick,
  onCardFocus,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: state });

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-[var(--text-tertiary)] font-mono bg-[var(--bg-subtle)] border border-[var(--border)] rounded px-1.5 py-0.5">
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-24 rounded-xl transition-colors space-y-2 p-2 ${
          isOver
            ? "bg-[var(--bg-hover)] ring-1 ring-[var(--border-strong)]"
            : "bg-[var(--bg-subtle)]"
        }`}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              isFocused={focusedCardId === card.id}
              onClick={() => onCardClick(card)}
              onFocus={() => onCardFocus(card.id)}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="h-16 flex items-center justify-center">
            <span className="text-[10px] text-[var(--text-tertiary)]">Drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}
