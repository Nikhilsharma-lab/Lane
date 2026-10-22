"use client";

import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu";
import { statusLabel, type AllowedMove, type LifecycleMove } from "@/lib/request-lifecycle";
import { StatusGlyph } from "./status-glyph";

/** Same control in detail and its Properties sheet; caller supplies the allowed lifecycle move. */
export function RequestStatusControl({ status, move, onMove, className }: {
  status: "open" | "in_progress" | "done";
  move: AllowedMove | null;
  onMove: (move: LifecycleMove) => void;
  className?: string;
}) {
  const label = statusLabel(status);
  const icon = <StatusGlyph status={status} />;
  if (!move) return <Badge appearance="control" className={className} icon={icon}>{label}</Badge>;
  return <DropdownMenu label="Change status" items={[{ label: move.label, icon: <StatusGlyph status={move.to} />, onSelect: () => onMove(move.move) }]}
    trigger={<Button type="button" variant="secondary" size="sm" morph="plain" className={className} aria-label={`Status: ${label}. Change status`}>{icon}<span>{label}</span></Button>} />;
}
