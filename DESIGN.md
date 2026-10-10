# Lane product design: Arc UI

Arc UI is the sole visual design authority for the product app, confirmed by Nikhil on 2026-10-06. Use its official components, licensed Pro source, theme, typography, layout, motion and composition guidance. On 2026-10-07, Nikhil explicitly approved Linear as the interaction and navigation reference for Requests, Request detail and Projects. This does not introduce another visual library or expand the product scope. Do not consult retired themes.

Marketing is explicitly out of scope. Do not edit the independent `marketing/` repository until Nikhil requests that work.

**Visual system (current, 2026-10-10):** the whole app renders Lane's own dense visual system. `src/app/layout.tsx` imports `src/styles/lane-primitives.css` (OKLCH colour ramps on one cool neutral axis with a green-teal accent, plus geometry, type and spacing roles; every text-on-surface pair passes 4.5:1 in both modes) and `src/styles/lane-arc-theme.css` (the mapping into Arc's semantic hooks), and sets `data-visual-system="lane"` with `data-ui-state-contract="semantic"`. Storybook renders every story the same way by default; one Arc reference story opts out with `parameters.visualSystem = "arc"`. Arc still supplies every component, API and motion.

History: on 2026-10-08 Nikhil reviewed a Geist neutral + blue preview and then a Linear-style density review (values captured from Linear); on 2026-10-09 that review went to production; on 2026-10-10, under the accepted MVP launch plan (decision 8.7), the captured values and their records were replaced by the Lane-authored tokens above, and the Geist preview was retired (decision 8.12). The density, 44px rows and 13px type carry over; the colour values do not.

## Authoritative sources

- [Arc documentation](https://uiarc.dev/docs/introduction), [theming](https://uiarc.dev/docs/theming), and [AI/MCP](https://uiarc.dev/docs/ai).
- Official installed skill: `.claude/skills/arc/SKILL.md`; licensed workflows: `.claude/skills/arc-pro/SKILL.md`.
- Source: `src/components/arc/`. `foundation.css` is the single source of visual token values. Load Inter as `--font-inter` and Geist as `--font-geist`. Light and dark follow `data-theme` on `<html>`; the Lane visual system above maps its values onto Arc's hooks, so Arc's accent presets (`data-accent`) are no longer set in production. Nikhil selected Green on 2026-10-08, replacing Rose, and the Lane accent keeps that choice; preserve Arc's native light/dark accent and control tokens. Keep success, warning and danger semantic, and use the workspace-sidebar's native category colours for Project markers.
- `src/app/globals.css` supplies Tailwind and product semantic aliases referencing Arc tokens. It must not define a second palette, font system, theme or component reset. No per-surface token overrides.
- Registry IDs and adaptations: `docs/design-system/arc-sources.md`. `components.json` uses Arc registries only. The shadcn installer is a transport dependency; its Radix-compatible configuration prevents it from rewriting Arc's APIs.

## Implementation

Read actual Arc source and documented props before use. Install existing items where suitable; compose Lane's existing behavior around them. Do not copy demo data, pretend callbacks work, or introduce demo features. Record a functional gap and any necessary adaptation. Prefer stock Lucide icons with Arc's sizing and stroke conventions. Product-specific shapes, semantic markup and state controllers are application code, not a competing design library.

Clerk owns authentication, organizations and invitations. Retain its working flows and apply Arc through its supported appearance API. Server identity, permissions, saved data, AI review, draft recovery and private uploads must survive the migration. `REQUIREMENTS.md` is the product behavior authority. This visual migration adds no routes, tables, AI calls or cron jobs.

## Verification

Use production components in Storybook. Verify light and dark modes, 390/768/1024/1440 widths, loading/empty/error/success, long content, keyboard operation, focus return and reduced motion. Keyboard focus uses Arc's shared `:focus-visible` outline (`--focus-outline`); pointer focus draws no ring, and fills mark hover, open menus and selection. Keep semantic labels, headings and live regions; correct a demonstrated contrast issue with an existing Arc semantic token and document it. Run TypeScript, lint, relevant behavioral tests and the production build. Local verification is not deployed/provider verification.
