# One theme file holds every visual value

Every colour, font, corner, shadow, size and motion value lives in `src/styles/theme.css`: tweakcn's export on
top, pasted and never hand-edited, and Lane additions below (2026-10-22, #87). Lane's look had been replaced
four times since 2026-10-08, each switch stacking a layer on the last, until a colour passed through four
hand-written layers and dark mode, screens and edits kept drifting apart.

## Considered Options

- The 2026-10-13 Supabase token layers (`supabase-tokens.css`, `lane-arc-theme.css`): deleted.

## Consequences

- Arc keeps components and motion; `theme-bridge.css` only renames and holds no values.
- Product CSS writes no design literals, enforced by `pnpm design:check`.

Source: `docs/design-system/theme-file.md`, issue #87.
