"use client";

import { useState } from "react";
import Link from "next/link";
import type { ShippedCard } from "@/lib/radar";

function CycleCard({ card }: { card: ShippedCard }) {
  const [expanded, setExpanded] = useState(false);
  const hasBreakdown = card.designDays !== null || card.devDays !== null;

  const breakdownLabel = `Design: ${card.designDays !== null ? `${card.designDays}d` : "—"} · Dev: ${card.devDays !== null ? `${card.devDays}d` : "—"}`;

  return (
    <div className="border border-[var(--border)] rounded-xl px-5 py-3">
      <Link
        href={`/dashboard/requests/${card.requestId}`}
        className="text-sm text-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors"
      >
        {card.title}
      </Link>
      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
        {card.designerName} · {card.fullDays}d full cycle
      </p>
      {hasBreakdown && (
        <button
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mt-1 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "▲ Collapse" : `▶ ${breakdownLabel}`}
        </button>
      )}
      {expanded && (
        <div className="mt-1 flex gap-4 text-xs text-[var(--text-secondary)]">
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
      <p className="text-sm text-[var(--text-tertiary)] border border-[var(--border)] rounded-xl px-5 py-4">
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
