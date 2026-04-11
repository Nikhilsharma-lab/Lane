"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { CardDrawer } from "./card-drawer";
import { RealtimeDashboard } from "@/components/realtime/realtime-dashboard";
import {
  KANBAN_STATES,
  KANBAN_STATE_LABELS,
  type CardData,
  type KanbanState,
} from "./types";

interface Props {
  columns: Record<KanbanState, CardData[]>;
  orgId: string;
}

export function DevBoard({ columns: initialColumns, orgId }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [drawerCard, setDrawerCard] = useState<CardData | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep columns in sync when server re-renders (after router.refresh())
  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const moveCard = useCallback(
    async (cardId: string, fromState: KanbanState, toState: KanbanState) => {
      if (fromState === toState) return;

      // Capture the card before optimistic update for safe revert
      let capturedCard: CardData | undefined;
      setColumns((prev) => {
        const card = prev[fromState].find((c) => c.id === cardId);
        if (!card) return prev;
        capturedCard = card;
        return {
          ...prev,
          [fromState]: prev[fromState].filter((c) => c.id !== cardId),
          [toState]: [...prev[toState], { ...card, kanbanState: toState }],
        };
      });
      setError(null);

      function revert() {
        if (!capturedCard) return;
        const cardToRestore = { ...capturedCard, kanbanState: fromState };
        setColumns((prev) => ({
          ...prev,
          [toState]: prev[toState].filter((c) => c.id !== cardId),
          [fromState]: [...prev[fromState], cardToRestore],
        }));
      }

      try {
        const res = await fetch(`/api/requests/${cardId}/kanban`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: toState }),
        });
        if (!res.ok) {
          const data = await res.json();
          revert();
          setError(data.error ?? "Failed to move card");
        } else {
          router.refresh();
        }
      } catch {
        revert();
        setError("Network error");
      }
    },
    [router]
  );

  // Keyboard shortcuts: ] forward, [ back, Enter open drawer, Escape close/deselect
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (drawerCard && e.key === "Escape") {
        e.preventDefault();
        setDrawerCard(null);
        return;
      }
      if (!focusedCardId) return;

      let card: CardData | null = null;
      let currentState: KanbanState | null = null;
      for (const state of KANBAN_STATES) {
        const found = columns[state].find((c) => c.id === focusedCardId);
        if (found) {
          card = found;
          currentState = state;
          break;
        }
      }
      if (!card || !currentState) return;

      const idx = KANBAN_STATES.indexOf(currentState);

      if (e.key === "]" && idx < KANBAN_STATES.length - 1) {
        e.preventDefault();
        moveCard(card.id, currentState, KANBAN_STATES[idx + 1]);
      } else if (e.key === "[" && idx > 0) {
        e.preventDefault();
        moveCard(card.id, currentState, KANBAN_STATES[idx - 1]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        setDrawerCard(card);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setFocusedCardId(null);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [focusedCardId, columns, drawerCard, moveCard]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;

    // over.id may be a column state OR a card id (when dropped onto a card)
    let toState = over.id as KanbanState;
    if (!KANBAN_STATES.includes(toState)) {
      // over.id is a card — find which column owns it
      for (const state of KANBAN_STATES) {
        if (columns[state].find((c) => c.id === (over.id as string))) {
          toState = state;
          break;
        }
      }
    }

    if (!KANBAN_STATES.includes(toState)) return; // still not found, bail

    let fromState: KanbanState | null = null;
    for (const state of KANBAN_STATES) {
      if (columns[state].find((c) => c.id === cardId)) {
        fromState = state;
        break;
      }
    }
    if (!fromState) return;
    moveCard(cardId, fromState, toState);
  }

  return (
    <>
      <RealtimeDashboard orgId={orgId} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full overflow-x-auto pb-6">
          {KANBAN_STATES.map((state) => (
            <KanbanColumn
              key={state}
              state={state}
              label={KANBAN_STATE_LABELS[state]}
              cards={columns[state]}
              focusedCardId={focusedCardId}
              onCardClick={setDrawerCard}
              onCardFocus={setFocusedCardId}
            />
          ))}
        </div>
      </DndContext>

      {/* Keyboard hint */}
      {focusedCardId && !drawerCard && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-muted border text-muted-foreground text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-3">
          <span><kbd className="font-mono text-foreground">[</kbd> / <kbd className="font-mono text-foreground">]</kbd> move</span>
          <span><kbd className="font-mono text-foreground">Enter</kbd> open</span>
          <span><kbd className="font-mono text-foreground">Esc</kbd> deselect</span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Slide-over drawer */}
      {drawerCard && (
        <CardDrawer card={drawerCard} onClose={() => setDrawerCard(null)} />
      )}
    </>
  );
}
