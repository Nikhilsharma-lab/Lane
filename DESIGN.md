# Lane product design: Arc components and Supabase styling

Arc UI supplies product components, APIs, interactions and motion. Supabase Studio supplies visual values for colours, spacing, radii, surfaces and shadows, confirmed on 2026-10-13 and reaffirmed on 2026-10-16. Use official Arc components and licensed Pro source, mapped through Lane’s Supabase token layer. Keep Geist and existing product composition. On 2026-10-07, Nikhil explicitly approved Linear as the interaction and navigation reference for Requests, Request detail and Projects. This does not introduce another visual library or expand the product scope. Do not consult retired themes.

Marketing is a separate local project, not part of this repository. The old `marketing/` repository was removed on 2026-10-15.

**Visual system (current, 2026-10-13):** Supabase Studio's design tokens are Lane's single source of visual values, copied exactly (Nikhil, 2026-10-13). `src/app/layout.tsx` imports `src/styles/supabase-tokens.css` (every `--sb-*` colour, palette, type, radius, spacing, shadow, motion and component-size token, pinned to a Supabase commit) and `src/styles/lane-arc-theme.css` (maps all Arc foundation tokens and Lane hooks onto them), and sets `data-visual-system="lane"` with `data-ui-state-contract="semantic"`. The typeface is Geist with Geist Mono instead of Studio's Inter, Manrope and Source Code Pro. Values are pixel-exact even where they miss WCAG AA. Product CSS writes no design literals; it reads Arc hooks or `--sb-*` tokens. Arc still supplies every component, API and motion. Source, mapping, exceptions and the Arc literals that remain: `docs/design-system/supabase-tokens.md`.

History: on 2026-10-08 Nikhil reviewed a Geist neutral + blue preview and then a Linear-style density review (values captured from Linear); on 2026-10-09 that review went to production; on 2026-10-10, under the accepted MVP launch plan (decision 8.7), the captured values were replaced by Lane-authored tokens (`lane-primitives.css`, accent blue-violet from 2026-10-11); on 2026-10-13 those were replaced by Supabase's tokens and the file was deleted. The 44px rows, 13px type and blue-violet accent no longer apply.

## Authoritative sources

- [Arc documentation](https://uiarc.dev/docs/introduction), [theming](https://uiarc.dev/docs/theming), and [AI/MCP](https://uiarc.dev/docs/ai).
- Official installed skill: `.claude/skills/arc/SKILL.md`; licensed workflows: `.claude/skills/arc-pro/SKILL.md`.
- Source: `src/components/arc/`. Arc's `foundation.css` defines the token names its components read; in production every one is overridden by `lane-arc-theme.css` with a Supabase value, so `src/styles/supabase-tokens.css` is the single source of visual values. Load Geist as `--font-geist` and Geist Mono as `--font-geist-mono`. Light and dark follow `data-theme` on `<html>`; Arc's accent presets (`data-accent`) are not set in production. The accent is Supabase's primary green (hue 157.5). Keep success, warning and danger semantic; Project markers use Supabase palette step 900.
- `src/app/globals.css` supplies Tailwind's theme and Studio's base layer, both reading the Supabase tokens. It must not define a second palette, font system, theme or component reset. No per-surface token overrides.
- Registry IDs and adaptations: `docs/design-system/arc-sources.md`. `components.json` uses Arc registries only. The shadcn installer is a transport dependency; its Radix-compatible configuration prevents it from rewriting Arc's APIs.

## Implementation

Read actual Arc source and documented props before use. Install existing items where suitable; compose Lane's existing behavior around them. Do not copy demo data, pretend callbacks work, or introduce demo features. Record a functional gap and any necessary adaptation. Prefer stock Lucide icons with Arc's sizing and stroke conventions. Product-specific shapes, semantic markup and state controllers are application code, not a competing design library.

Clerk owns authentication, organizations and invitations. Retain its working flows and apply Arc through its supported appearance API. Server identity, permissions, saved data, AI review, draft recovery and private uploads must survive the migration. `REQUIREMENTS.md` is the product behavior authority. This visual migration adds no routes, tables, AI calls or cron jobs.

## Verification

Verify production components in the running app (Storybook was removed on 2026-10-21): light and dark modes, 390/768/1024/1440 widths, loading/empty/error/success, long content, keyboard operation, focus return and reduced motion. Keyboard focus uses Arc's shared `:focus-visible` outline (`--focus-outline`); pointer focus draws no ring, and fills mark hover, open menus and selection. Keep semantic labels, headings and live regions; correct a demonstrated contrast issue with an existing Arc semantic token and document it. Run TypeScript, lint, relevant behavioral tests and the production build. Local verification is not deployed/provider verification.
