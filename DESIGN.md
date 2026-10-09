# Lane product design: Arc UI

Arc UI is the sole visual design authority for the product app, confirmed by Nikhil on 2026-10-06. Use its official components, licensed Pro source, theme, typography, layout, motion and composition guidance. On 2026-10-07, Nikhil explicitly approved Linear as the interaction and navigation reference for Requests, Request detail and Projects. This does not introduce another visual library or expand the product scope. Do not consult retired themes.

Marketing is explicitly out of scope. Do not edit the independent `marketing/` repository until Nikhil requests that work.

On 2026-10-08, Nikhil approved a **Geist neutral + blue colour preview** for Requests and the sidebar. `src/styles/geist-colors.css` is the colour authority only for Storybook stories opting into `parameters.colorSystem = "geist"`; Arc still supplies their components, typography, geometry and motion. The production root retains Arc Green pending review. This exception does not authorize marketing or Request detail changes. See `docs/superpowers/plans/2026-10-08-geist-colours.md`.

Later on 2026-10-08, Nikhil approved implementing **Linear visual primitives with Arc components** as a separate Requests/sidebar review. Stories opting into `parameters.visualSystem = "linear"` use verified Linear Light/Dark colours, sourced spacing/geometry and type metrics with Inter. Arc retains component APIs, keyboard mechanics and motion. See `docs/design-system/linear-primitives.md` and the approved implementation plan.

On 2026-10-09, Nikhil moved the Linear primitives into production for the whole app, Request detail included: the root layout imports `linear-primitives.css` and `linear-arc-theme.css` and sets `data-visual-system="linear"` with `data-ui-state-contract="semantic"`. Arc still supplies every component, API and motion. The same decision activated the compact Requests rows (saved codes, saved priority, status glyphs, row context menu, per-group New Request, list summary) and the folder-tree Project navigation in production. Marketing remains out of scope.

## Authoritative sources

- [Arc documentation](https://uiarc.dev/docs/introduction), [theming](https://uiarc.dev/docs/theming), and [AI/MCP](https://uiarc.dev/docs/ai).
- Official installed skill: `.claude/skills/arc/SKILL.md`; licensed workflows: `.claude/skills/arc-pro/SKILL.md`.
- Source: `src/components/arc/`. `foundation.css` is the single source of visual token values. Load Inter as `--font-inter` and Geist as `--font-geist`. Use Arc's built-in Green accent (`data-accent="green"`) and native light/dark tokens through `data-theme` on `<html>`. Nikhil selected Green on 2026-10-08, replacing Rose; preserve Arc's native light/dark accent and control tokens. Keep success, warning and danger semantic, and use the workspace-sidebar's native category colours for Project markers.
- `src/app/globals.css` supplies Tailwind and product semantic aliases referencing Arc tokens. It must not define a second palette, font system, theme or component reset. No per-surface token overrides.
- Registry IDs and adaptations: `docs/design-system/arc-sources.md`. `components.json` uses Arc registries only. The shadcn installer is a transport dependency; its Radix-compatible configuration prevents it from rewriting Arc's APIs.

## Implementation

Read actual Arc source and documented props before use. Install existing items where suitable; compose Lane's existing behavior around them. Do not copy demo data, pretend callbacks work, or introduce demo features. Record a functional gap and any necessary adaptation. Prefer stock Lucide icons with Arc's sizing and stroke conventions. Product-specific shapes, semantic markup and state controllers are application code, not a competing design library.

Clerk owns authentication, organizations and invitations. Retain its working flows and apply Arc through its supported appearance API. Server identity, permissions, saved data, AI review, draft recovery and private uploads must survive the migration. `REQUIREMENTS.md` is the product behavior authority. This visual migration adds no routes, tables, AI calls or cron jobs.

## Verification

Use production components in Storybook. Verify light and dark modes, 390/768/1024/1440 widths, loading/empty/error/success, long content, keyboard operation, focus return and reduced motion. Keyboard focus uses Arc's fills. Keep semantic labels, headings and live regions; correct a demonstrated contrast issue with an existing Arc semantic token and document it. Run TypeScript, lint, relevant behavioral tests and the production build. Local verification is not deployed/provider verification.
