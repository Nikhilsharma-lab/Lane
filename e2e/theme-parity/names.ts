/**
 * The names the theme parity test reads (spec #87, Seam 1).
 *
 * Frozen on purpose: taken from the files that exist before the theme switch,
 * so the test keeps reading the same names after the internals are renamed.
 *
 * - Arc foundation names: every custom property declared in
 *   `src/components/arc/foundation.css` (115).
 * - Lane hooks: every custom property declared only in
 *   `src/styles/lane-arc-theme.css` (166).
 */
const list = (names: string) => names.trim().split(/\s+/);

export const ARC_FOUNDATION_NAMES = list(`
--accent --accent-foreground --accent-strong --accent-subtle --arc-gradient
--arc-gradient-foreground --arc-gradient-from --arc-gradient-ink --arc-gradient-line
--arc-gradient-soft --arc-gradient-to --background --border --border-strong
--border-subtle --border-width --control-fill --control-glyph --control-height-lg
--control-height-md --control-height-sm --control-on --control-on-subtle --control-thumb
--control-thumb-on --control-thumb-shadow --control-track --control-track-hover --danger
--duration-considered --duration-fast --duration-instant --duration-spring
--duration-standard --ease-enter --ease-exit --ease-in-out --ease-spring --ease-standard
--focus-ring --font-body --font-display --foreground --icon-size --icon-size-2xl
--icon-size-lg --icon-size-md --icon-size-sm --icon-size-xl --icon-size-xs --leading-body
--leading-display --neutral-0 --neutral-1 --neutral-10 --neutral-11 --neutral-2
--neutral-3 --neutral-4 --neutral-5 --neutral-6 --neutral-7 --neutral-8 --neutral-9
--overlay-backdrop --radius-2xl --radius-3xl --radius-control --radius-panel
--radius-pill --radius-sm --radius-surface --radius-xl --radius-xs --series-1 --series-2
--series-3 --series-4 --shadow-floating --shadow-raised --shadow-resting --skeleton-fill
--space-1 --space-10 --space-12 --space-16 --space-2 --space-20 --space-24 --space-3
--space-4 --space-5 --space-6 --space-8 --success --surface --surface-muted
--surface-raised --text-2xl --text-3xl --text-4xl --text-5xl --text-base --text-lg
--text-muted --text-secondary --text-sm --text-xl --text-xs --tooltip-muted
--tracking-body --tracking-display --warning --weight-medium --weight-normal
`);

export const LANE_HOOK_NAMES = list(`
--avatar-status-shadow --badge-font-weight --badge-gap --badge-height
--badge-icon-padding-start --badge-padding-x --badge-padding-y --badge-sm-font
--badge-sm-gap --badge-sm-height --badge-sm-icon-padding-start --badge-sm-padding
--button-danger-background --button-danger-foreground --button-danger-hover
--button-default-shadow --button-disabled-opacity --button-icon-lg --button-icon-md
--button-icon-sm --button-padding-lg --button-padding-md --button-padding-sm
--button-radius-lg --button-radius-md --button-radius-sm --button-raised-shadow
--button-secondary-background --button-secondary-hover --button-secondary-sheen
--button-solid-border-width --button-solid-sheen --checkbox-radius --checkbox-size
--destructive --destructive-border --destructive-foreground --destructive-soft
--dialog-background --dialog-shadow --floating-action-height --floating-border-width
--floating-foreground --focus-outline --focus-outline-offset --focus-outline-width --info
--info-border --info-foreground --info-soft --input-background --input-border
--input-border-hover --input-error-background --input-error-border
--input-error-border-active --input-readonly-border --interaction-background
--interaction-border --interaction-focus --interaction-hover --interaction-pressed
--lane-panel-radius --menu-font-weight --menu-item-gap --menu-item-padding
--menu-item-radius --menu-padding --menu-row-height --menu-shadow --navigation-background
--overlay --popover-padding --popover-shadow --primary-background
--primary-focus-background --primary-hover-background --primary-hover-opacity
--primary-label --primary-pressed-background --primary-pressed-opacity --project-amber
--project-blue --project-coral --project-dot-shadow --project-green --project-slate
--project-violet --request-avatar-size --request-group-gap --request-property-background
--request-property-border --request-property-foreground --request-row-height
--request-row-radius --request-title-line-height --request-toolbar-height
--search-highlight-foreground --segment-background --segment-border-width
--segment-font-size --segment-foreground --segment-gap --segment-height
--segment-item-padding --segment-item-radius --segment-padding --segment-radius
--segment-selection-background --segment-selection-border-width
--segment-selection-shadow --select-item-padding --select-panel-radius
--select-viewport-padding --selection-background --selection-border
--selection-focus-decoration --selection-foreground --selection-hover --selection-icon
--selection-pressed --selection-property-border --selection-secondary-foreground
--sidebar-action-icon-size --sidebar-icon-size --sidebar-logo-shadow
--sidebar-photo-shadow --sidebar-row-height --sidebar-row-radius
--state-danger-background --state-danger-border --state-danger-hover --state-danger-icon
--state-danger-text --state-info-background --state-info-border --state-info-hover
--state-info-icon --state-info-text --state-neutral-background --state-neutral-border
--state-neutral-hover --state-neutral-text --state-success-background
--state-success-border --state-success-hover --state-success-icon --state-success-text
--state-warning-background --state-warning-border --state-warning-hover
--state-warning-icon --state-warning-text --success-border --success-foreground
--success-soft --textarea-padding --toolbar-icon-size --user-menu-presence-shadow
--warning-border --warning-foreground --warning-soft --workspace-canvas
--workspace-header-height --workspace-pane-border-width --workspace-pane-radius
`);

export const THEME_NAMES: readonly string[] = [
  ...ARC_FOUNDATION_NAMES,
  ...LANE_HOOK_NAMES,
];
