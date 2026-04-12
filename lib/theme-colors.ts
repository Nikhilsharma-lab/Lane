/**
 * Shared color class maps for badges, pills, and status indicators.
 *
 * These provide Tailwind class strings keyed by domain value.
 * All colors reference CSS custom properties from globals.css —
 * no hardcoded hex or Tailwind palette colors.
 */

// ---------------------------------------------------------------------------
// Priority badge classes  (bg + text + border)
// ---------------------------------------------------------------------------

export const PRIORITY_BADGE: Record<string, string> = {
  p0: "bg-priority-p0/15 text-priority-p0 border-priority-p0/20",
  p1: "bg-priority-p1/15 text-priority-p1 border-priority-p1/20",
  p2: "bg-priority-p2/15 text-priority-p2 border-priority-p2/20",
  p3: "bg-accent text-muted-foreground border",
}

/** Text-only priority coloring (for inline labels). */
export const PRIORITY_TEXT: Record<string, string> = {
  p0: "text-priority-p0",
  p1: "text-priority-p1",
  p2: "text-priority-p2",
  p3: "text-muted-foreground",
}

// ---------------------------------------------------------------------------
// Phase badge classes
// ---------------------------------------------------------------------------

export const PHASE_BADGE: Record<string, string> = {
  predesign:
    "bg-phase-predesign/10 text-phase-predesign border-phase-predesign/20",
  design: "bg-phase-design/10 text-phase-design border-phase-design/20",
  dev: "bg-phase-dev/10 text-phase-dev border-phase-dev/20",
  track: "bg-phase-track/10 text-phase-track border-phase-track/20",
}

// ---------------------------------------------------------------------------
// Status badge classes
// ---------------------------------------------------------------------------

export const STATUS_BADGE: Record<string, string> = {
  draft: "bg-accent text-muted-foreground border-border",
  submitted:
    "bg-status-submitted/10 text-status-submitted border-status-submitted/20",
  triaged:
    "bg-status-triaged/10 text-status-triaged border-status-triaged/20",
  assigned:
    "bg-status-assigned/10 text-status-assigned border-status-assigned/20",
  in_progress:
    "bg-status-in-progress/10 text-status-in-progress border-status-in-progress/20",
  in_review:
    "bg-status-in-review/10 text-status-in-review border-status-in-review/20",
  blocked:
    "bg-status-blocked/10 text-status-blocked border-status-blocked/20",
  completed:
    "bg-status-completed/10 text-status-completed border-status-completed/20",
  shipped:
    "bg-status-shipped/10 text-status-shipped border-status-shipped/20",
}

/** Inline style objects for status indicators using CSS vars directly. */
export const STATUS_STYLE: Record<
  string,
  { bg: string; color: string }
> = {
  draft: {
    bg: "color-mix(in oklch, var(--status-draft) 10%, transparent)",
    color: "var(--status-draft)",
  },
  submitted: {
    bg: "color-mix(in oklch, var(--status-submitted) 10%, transparent)",
    color: "var(--status-submitted)",
  },
  triaged: {
    bg: "color-mix(in oklch, var(--status-triaged) 10%, transparent)",
    color: "var(--status-triaged)",
  },
  assigned: {
    bg: "color-mix(in oklch, var(--status-assigned) 10%, transparent)",
    color: "var(--status-assigned)",
  },
  in_progress: {
    bg: "color-mix(in oklch, var(--status-in-progress) 10%, transparent)",
    color: "var(--status-in-progress)",
  },
  in_review: {
    bg: "color-mix(in oklch, var(--status-in-review) 10%, transparent)",
    color: "var(--status-in-review)",
  },
  blocked: {
    bg: "color-mix(in oklch, var(--status-blocked) 10%, transparent)",
    color: "var(--status-blocked)",
  },
  completed: {
    bg: "color-mix(in oklch, var(--status-completed) 10%, transparent)",
    color: "var(--status-completed)",
  },
  shipped: {
    bg: "color-mix(in oklch, var(--status-shipped) 10%, transparent)",
    color: "var(--status-shipped)",
  },
}

/** Inline style objects for priority indicators using CSS vars directly. */
export const PRIORITY_STYLE: Record<
  string,
  { bg: string; color: string }
> = {
  p0: {
    bg: "color-mix(in oklch, var(--priority-p0) 12%, transparent)",
    color: "var(--priority-p0)",
  },
  p1: {
    bg: "color-mix(in oklch, var(--priority-p1) 12%, transparent)",
    color: "var(--priority-p1)",
  },
  p2: {
    bg: "color-mix(in oklch, var(--priority-p2) 12%, transparent)",
    color: "var(--priority-p2)",
  },
  p3: {
    bg: "color-mix(in oklch, var(--priority-p3) 12%, transparent)",
    color: "var(--priority-p3)",
  },
}

// ---------------------------------------------------------------------------
// Decision / validation classes
// ---------------------------------------------------------------------------

export const DECISION_BADGE: Record<string, string> = {
  approved:
    "bg-accent-success/10 text-accent-success border-accent-success/20",
  approved_with_conditions:
    "bg-accent-warning/10 text-accent-warning border-accent-warning/20",
  rejected:
    "bg-accent-danger/10 text-accent-danger border-accent-danger/20",
  pending_votes: "bg-accent text-muted-foreground border-border",
  validation:
    "bg-accent-warning/10 text-accent-warning border-accent-warning/20",
}

// ---------------------------------------------------------------------------
// Sticky note colors
// ---------------------------------------------------------------------------

export const STICKY_COLORS = [
  { key: "cream", hex: "#F8F6F1" },
  { key: "green", hex: "#2E5339" },
  { key: "rose", hex: "#C27B9E" },
  { key: "sky", hex: "#7DA5C4" },
  { key: "amber", hex: "#D4A84B" },
] as const
