"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ShippedCard } from "@/lib/radar";

function CycleCard({ card }: { card: ShippedCard }) {
  const [expanded, setExpanded] = useState(false);
  const hasBreakdown = card.designDays !== null || card.devDays !== null;

  const breakdownLabel = `Design: ${card.designDays !== null ? `${card.designDays}d` : "—"} · Dev: ${card.devDays !== null ? `${card.devDays}d` : "—"}`;

  return (
    <div className="border rounded-xl px-5 py-3">
      <Link
        href={`/dashboard/requests/${card.requestId}`}
        className="text-sm text-foreground hover:text-foreground transition-colors"
      >
        {card.title}
      </Link>
      <p className="text-xs text-muted-foreground mt-0.5">
        {card.designerName} · {card.fullDays}d full cycle
      </p>
      {hasBreakdown && (
        <Button
          variant="link"
          size="sm"
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground mt-1 p-0 h-auto"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "▲ Collapse" : `▶ ${breakdownLabel}`}
        </Button>
      )}
      {expanded && (
        <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
          <span>Design: {card.designDays !== null ? `${card.designDays}d` : "—"}</span>
          <span>Dev: {card.devDays !== null ? `${card.devDays}d` : "—"}</span>
        </div>
      )}
    </div>
  );
}

export function ShippedWeek({ shipped }: { shipped: ShippedCard[] }) {
  if (shipped.length === 0) {
    return (
      <p className="text-sm text-muted-foreground/60 border rounded-xl px-5 py-4">
        Nothing shipped yet this week — keep pushing.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {shipped.map((card) => (
        <CycleCard key={card.requestId} card={card} />
      ))}
    </div>
  );
}
