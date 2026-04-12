/**
 * Design tokens — single source of truth for all styling.
 *
 * These map 1:1 to CSS custom properties defined in globals.css.
 * Components reference these tokens (via cva / className) instead of
 * hardcoding values. Tailwind classes like `bg-primary` already resolve
 * the CSS vars; these tokens are for programmatic access in cva variants,
 * conditional styles, and JS-driven UI.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** Core UI colors — resolved from CSS custom properties at runtime. */
export const colors = {
  background: "var(--background)",
  foreground: "var(--foreground)",

  primary: "var(--primary)",
  "primary-foreground": "var(--primary-foreground)",

  secondary: "var(--secondary)",
  "secondary-foreground": "var(--secondary-foreground)",

  muted: "var(--muted)",
  "muted-foreground": "var(--muted-foreground)",

  accent: "var(--accent)",
  "accent-foreground": "var(--accent-foreground)",

  destructive: "var(--destructive)",

  card: "var(--card)",
  "card-foreground": "var(--card-foreground)",

  popover: "var(--popover)",
  "popover-foreground": "var(--popover-foreground)",

  border: "var(--border)",
  input: "var(--input)",
  ring: "var(--ring)",
} as const;

/** Semantic accent colors for status indicators and signals. */
export const accentColors = {
  active: "var(--accent-active)",
  success: "var(--accent-success)",
  warning: "var(--accent-warning)",
  danger: "var(--accent-danger)",
  info: "var(--accent-info)",
} as const;

/** Phase colors — one per workflow phase. */
export const phaseColors = {
  predesign: "var(--phase-predesign)",
  design: "var(--phase-design)",
  dev: "var(--phase-dev)",
  track: "var(--phase-track)",
} as const;

/** Status colors — request lifecycle states. */
export const statusColors = {
  draft: "var(--status-draft)",
  submitted: "var(--status-submitted)",
  triaged: "var(--status-triaged)",
  assigned: "var(--status-assigned)",
  "in-progress": "var(--status-in-progress)",
  "in-review": "var(--status-in-review)",
  blocked: "var(--status-blocked)",
  completed: "var(--status-completed)",
  shipped: "var(--status-shipped)",
} as const;

/** Priority colors — P0 (critical) → P3 (low). */
export const priorityColors = {
  p0: "var(--priority-p0)",
  p1: "var(--priority-p1)",
  p2: "var(--priority-p2)",
  p3: "var(--priority-p3)",
} as const;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

/**
 * Spacing scale (in rem). Use as padding, margin, gap values.
 * Maps to a 4px base grid: 0.25rem = 4px at default font size.
 */
export const spacing = {
  0: "0",
  px: "1px",
  0.5: "0.125rem", //  2px
  1: "0.25rem",    //  4px
  1.5: "0.375rem", //  6px
  2: "0.5rem",     //  8px
  2.5: "0.625rem", // 10px
  3: "0.75rem",    // 12px
  4: "1rem",       // 16px
  5: "1.25rem",    // 20px
  6: "1.5rem",     // 24px
  8: "2rem",       // 32px
  10: "2.5rem",    // 40px
  12: "3rem",      // 48px
  16: "4rem",      // 64px
  20: "5rem",      // 80px
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

/** Border radius scale — references @theme vars from globals.css. */
export const radius = {
  none: "0",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
  full: "9999px",
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/** Font families — matches the @theme block in globals.css. */
export const fontFamily = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
} as const;

/** Font size + line-height pairs. */
export const fontSize = {
  xs: ["0.75rem", { lineHeight: "1rem" }],
  sm: ["0.875rem", { lineHeight: "1.25rem" }],
  base: ["1rem", { lineHeight: "1.5rem" }],
  lg: ["1.125rem", { lineHeight: "1.75rem" }],
  xl: ["1.25rem", { lineHeight: "1.75rem" }],
  "2xl": ["1.5rem", { lineHeight: "2rem" }],
  "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
} as const;

/** Font weights. */
export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// ---------------------------------------------------------------------------
// Tailwind class helpers
// ---------------------------------------------------------------------------

/**
 * Maps a phase key to the Tailwind-compatible CSS variable for use in
 * arbitrary value classes: `bg-[${tw.phase("design")}]`
 */
export const tw = {
  phase: (key: keyof typeof phaseColors) => phaseColors[key],
  status: (key: keyof typeof statusColors) => statusColors[key],
  priority: (key: keyof typeof priorityColors) => priorityColors[key],
  accent: (key: keyof typeof accentColors) => accentColors[key],
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColorToken = keyof typeof colors;
export type AccentToken = keyof typeof accentColors;
export type PhaseToken = keyof typeof phaseColors;
export type StatusToken = keyof typeof statusColors;
export type PriorityToken = keyof typeof priorityColors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
