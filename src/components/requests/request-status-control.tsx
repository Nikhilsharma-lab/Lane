"use client";

import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu";
import type { AllowedMove, LifecycleMove } from "@/lib/request-lifecycle";
import type { Journey } from "@/lib/request-journey";
import { StatusGlyph } from "./status-glyph";

/** Same control in detail and its Properties sheet; caller supplies the Request's journey (#133) and its allowed lifecycle move. */
export function RequestStatusControl({ journey, move, onMove, className }: {
  journey: Journey;
  move: AllowedMove | null;
  onMove: (move: LifecycleMove) => void;
  className?: string;
}) {
  const label = journey.label;
  const icon = <StatusGlyph status={journey.status} />;
  if (!move) return <Badge appearance="control" className={className} icon={icon}>{label}</Badge>;
  return <DropdownMenu label="Change status" items={[{ label: move.label, icon: <StatusGlyph status={move.to} />, onSelect: () => onMove(move.move) }]}
    trigger={<Button type="button" variant="secondary" size="sm" morph="plain" className={className} aria-label={`Status: ${label}. Change status`}>{icon}<span>{label}</span></Button>} />;
}
