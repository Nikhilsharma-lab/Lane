"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ProjectBadge } from "@/components/projects/project-badge";
import { PRIORITY_BADGE } from "@/lib/theme-colors";
import type { CardData } from "./types";

interface Props {
  card: CardData;
  isFocused: boolean;
  onClick: () => void;
  onFocus: () => void;
}

export function KanbanCard({ card, isFocused, onClick, onFocus }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      tabIndex={0}
      onClick={onClick}
      onFocus={onFocus}
      className={`bg-card border rounded-lg px-3 py-3 cursor-pointer select-none focus:outline-none transition-colors space-y-2 ${
        isFocused
          ? "border-primary/50 ring-1 ring-primary/20"
          : "border hover:border-border/80"
      }`}
    >
      {/* Title */}
      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
        {card.title}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {card.priority && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
              PRIORITY_BADGE[card.priority] ?? ""
            }`}
          >
            {card.priority.toUpperCase()}
          </span>
        )}
        {card.requestType && (
          <span className="text-[10px] text-muted-foreground bg-muted border rounded px-1.5 py-0.5 capitalize">
            {card.requestType}
          </span>
        )}
      </div>

      {/* Project */}
      {card.projectName && card.projectColor && (
        <ProjectBadge name={card.projectName} color={card.projectColor} />
      )}

      {/* Footer: assignees + deadline */}
      <div className="flex items-center justify-between gap-2">
        {card.assignees.length > 0 && (
          <span className="text-[10px] text-muted-foreground truncate">
            {card.assignees.join(", ")}
          </span>
        )}
        {card.deadlineAt && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {new Date(card.deadlineAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
