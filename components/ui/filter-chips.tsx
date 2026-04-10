"use client";

import { X } from "lucide-react";

export interface FilterChip {
  key: string;
  label: string;
  value: string;
  rawValue: string;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.rawValue}`}
          onClick={() => onRemove(chip.key)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors hover:bg-[var(--bg-hover)]"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <span style={{ fontWeight: 500, color: "var(--text-tertiary)" }}>
            {chip.label}:
          </span>
          <span style={{ fontWeight: 560 }}>{chip.value}</span>
          <X size={10} className="ml-0.5 opacity-50" />
        </button>
      ))}
      {chips.length >= 2 && (
        <button
          onClick={onClearAll}
          className="text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--bg-hover)]"
          style={{
            color: "var(--text-tertiary)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
