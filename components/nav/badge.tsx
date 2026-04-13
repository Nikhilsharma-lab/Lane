"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  tier: 1 | 2 | 3;
  value?: number;
  className?: string;
}

/**
 * Single badge component for all sidebar badges.
 *
 * Tier 1: Action required from you (red, numeric). Prove never caps.
 * Tier 2: New activity (neutral, numeric). Caps at 99+.
 * Tier 3: Ambient signal (dot, no number).
 */
export function NavBadge({ tier, value = 0, className }: BadgeProps) {
  if (value <= 0 && tier !== 3) return null;
  if (tier === 3 && value <= 0) return null;

  if (tier === 3) {
    return (
      <span
        className={cn(
          "size-1.5 rounded-full bg-muted-foreground/50",
          className,
        )}
        aria-label="New activity"
      />
    );
  }

  const isTier1 = tier === 1;
  // Prove (tier 1) never caps; everything else caps at 99+
  const display = value > 99 && !isTier1 ? "99+" : String(value);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-mono font-medium leading-none min-w-[18px] h-[18px]",
        isTier1
          ? "bg-destructive text-destructive-foreground"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {display}
    </span>
  );
}
