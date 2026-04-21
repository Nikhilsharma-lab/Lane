# Shadcn Preset Migration Design

**Date:** 2026-04-10
**Scope:** Full app restyle — replace Lane's current CSS variable design system with a custom shadcn preset
**Preset:** `b3bZBz3KVM`

---

## Context

Lane currently uses a custom "warm cream" design system (`#F8F6F1` base, `#2E5339` forest green, Satoshi + Geist Mono fonts) implemented via custom CSS variables (`var(--text-primary)`, `var(--border)`, `var(--bg-subtle)`, `var(--accent)` etc.) referenced throughout every component.

The goal is to replace this entirely with a new shadcn preset the product owner has built. The migration is a full restyle — every page and component moves to the new system over time.

---

## Approach: New Branch + CSS Shim + Progressive Migration

Chosen because the codebase is too widely styled with custom vars for a direct overwrite not to cause immediate chaos across all pages.

---

## Phase 1 — Branch + Init

Create a new branch and run the shadcn preset init:

```bash
git checkout -b restyle/shadcn-preset
npx shadcn@latest init --preset b3bZBz3KVM --base base --template next
```

This will:
- Overwrite `components.json` (accept all prompts)
- Regenerate `components/ui/` with preset-styled components
- Rewrite `globals.css` with the new CSS variable definitions

Accept all overwrite prompts.

---

## Phase 2 — CSS Variable Shim

After init, inspect `globals.css` to confirm the exact variable names the preset defines. The shim below assumes standard shadcn names (`--foreground`, `--muted-foreground`, etc.) — update the right-hand side values if the preset uses different names.

Add the shim at the bottom of `globals.css`. This maps Lane's old custom variables to the new shadcn tokens so every existing component continues to work immediately with the new palette — no broken pages.

```css
/* Lane compatibility shim — remove entries as components are migrated */
:root {
  --text-primary: hsl(var(--foreground));
  --text-secondary: hsl(var(--muted-foreground));
  --text-tertiary: hsl(var(--muted-foreground) / 0.6);
  --bg-subtle: hsl(var(--muted));
  --bg-hover: hsl(var(--accent));
  --bg-surface: hsl(var(--card));
  --border-strong: hsl(var(--border) / 0.8);
}
/* --border maps directly to shadcn's --border — no shim needed */
/* Lane's --accent (action color) maps to shadcn's --primary */
```

The shim entries are deleted one by one as each component is migrated to proper shadcn/Tailwind classes.

---

## Phase 3 — Migration Order

### Design Phase Screens (no migration — built fresh)
The 5-stage design flow (Sense → Frame → Diverge → Converge → Prove) is being built now and has no existing implementation to migrate. Write it directly in the new system.

### Existing Pages — migration priority:
1. **Request detail page** (`/dashboard/requests/[id]`) — most-used, highest visibility
2. **Dashboard** (`/dashboard`) — homepage, sets the overall tone
3. **Radar + Insights + Dev board** — secondary pages
4. **Settings + Auth pages** — lowest frequency, migrate last

---

## Per-Component Migration Pattern

For each component when it's being touched:

1. Replace `var(--text-primary)` / `var(--text-secondary)` / `var(--bg-*)` etc. with Tailwind utility classes using shadcn's token names (`text-foreground`, `text-muted-foreground`, `bg-muted`, `bg-card`, etc.)
2. Replace `var(--accent)` with `text-primary` / `bg-primary` (shadcn's primary = Lane's action color)
3. Swap raw `<button>` elements with shadcn `<Button>`
4. Swap raw `<input>` / `<textarea>` with shadcn `<Input>` / `<Textarea>`
5. Swap custom modal patterns with shadcn `<Dialog>`
6. Delete the corresponding shim entry from `globals.css` once the component no longer references it

---

## Success Criteria

- `npx shadcn@latest init --preset b3bZBz3KVM` runs cleanly on the new branch
- All existing pages render without visual breakage immediately after init (shim in place)
- Design phase screens are built entirely in the new system
- Shim entries are removed as each page is migrated
- `globals.css` shim block is fully empty when migration is complete
