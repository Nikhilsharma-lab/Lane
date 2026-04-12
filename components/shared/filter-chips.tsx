"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
        <Badge
          key={`${chip.key}-${chip.rawValue}`}
          variant="outline"
          className="cursor-pointer gap-1.5 px-2.5 py-1 text-xs transition-colors hover:bg-accent"
          render={<button onClick={() => onRemove(chip.key)} />}
        >
          <span className="text-muted-foreground/60 font-medium">
            {chip.label}:
          </span>
          <span className="font-semibold">{chip.value}</span>
          <X size={10} className="ml-0.5 opacity-50" />
        </Badge>
      ))}
      {chips.length >= 2 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onClearAll}
          className="text-xs text-muted-foreground/60"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
