# Arc components with Supabase styling implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Execution note: this request authorizes planning only. Check skill availability before execution; this plan does not require creating parallel agents.

**Goal:** Finish Lane's existing integration so Arc components consistently use Supabase Studio colours, spacing, radii, surfaces and shadows.

**Architecture:** Keep the existing chain: Supabase values in `supabase-tokens.css` → semantic mappings in `lane-arc-theme.css` → Arc components and Lane compositions. Prefer existing Arc hooks. Where a component hardcodes a requested visual property, add a narrow, documented token hook with its original Arc value as the fallback.

**Tech stack:** Existing Next.js 16, React 19, Tailwind v4, Arc UI, CSS modules and Storybook. No new runtime package is required.

**Status:** Controls accepted and app adoption authorized by Nikhil on 2026-10-16. Shared app styling implemented; focused verification passed, with broader test limitations recorded below. No deployment performed.

## Global constraints

- Arc owns React components, documented props, semantics, keyboard behavior, focus management and motion implementation.
- Supabase Studio owns the requested visual values: colours, spacing, radius, surface treatments and shadows, in light and dark.
- Retain Geist/Geist Mono and the current motion mapping. Typography redesign, uppercase badges and animation retuning are outside this increment.
- Preserve Lane's screen structure, routes, responsive behavior, copy, permissions, draft/upload recovery and Clerk flows.
- No new tables, routes, AI calls or cron jobs. Marketing is a separate project.
- Keep the recorded October 13 pixel-exact decision and document contrast results honestly. This work does not establish WCAG AA compliance.
- Deliver one bounded visual increment at a time, with a visible review before advancing to the next screen.
- Preserve unrelated working changes, including measurement-plan/date-range-picker work and its source-ledger entries.

## Findings from this review

The integration already exists. `src/app/layout.tsx` and `.storybook/preview.tsx` both import Arc foundation, Supabase tokens and Lane's Arc mapping. The token file includes separate light/dark colours, a 0.25rem spacing unit, radius scales, elevation shadows and button surface shadows. The mapping already connects Arc colour, spacing, radius and size hooks to these values.

The gap is component-level application. Direct inspection found:

- `button.module.css` uses one `--radius-control` for every size, Arc padding choices and an explicit secondary border. The presence of Supabase button-shadow tokens does not make the button consume them.
- `badge.module.css` still includes fixed gaps and colour-mix fallbacks. Some states have hooks; others need inspection before claiming parity.
- `controls.stories.tsx` explicitly opts into the plain Arc reference theme. It must remain a reference, not become the sole acceptance evidence for the Lane theme.
- `DESIGN.md` opens with an older sole-Arc-visual-authority statement before describing Supabase's current role. Clarifying that language will prevent future conflicting implementations.
- `docs/design-system/supabase-tokens.md` reports 742 remaining literals from its earlier audit. That count was not regenerated here and is not a current acceptance baseline. Mechanical values and motion values must not be swept into a visual rewrite.

## Source policy

Reviewed the supplied [Supabase repository](https://github.com/supabase/supabase), [design-system index](https://supabase.com/design-system), [colour usage](https://supabase.com/design-system/docs/color-usage), [theming](https://supabase.com/design-system/docs/theming), [Tailwind classes](https://supabase.com/design-system/docs/tailwind-classes) and [Button guidance](https://supabase.com/design-system/docs/components/button).

The colour guidance distinguishes functional primary colours from Supabase's fixed brand palette, and distinguishes Studio surfaces from marketing/docs backgrounds. Use Studio as Lane's reference. Button guidance also distinguishes normal and floating surface treatments. Do not assume one background or shadow fits every control placement.

Lane records upstream commit `64a6aa908594975646d157def9e7a74940634d8f`. Keep that baseline initially. Raw retrieval of that commit failed during this review; the accessible GitHub master views were cached and do not verify that commit. Consequently, exact upstream parity and latest-master parity are not claimed. Do not replace the baseline with values from a different cached revision.

Required source paths at the same verified commit:

| Concern | Supabase source |
| --- | --- |
| Semantic colours and themes | `packages/ui/build/css/source/semantic.css`, adjacent `themes/light.css` and `themes/dark.css` |
| Palette | `packages/config/css/colors.css` |
| Studio radius/type overrides | `apps/studio/styles/globals.css` |
| Surface shadows | `packages/config/css/utilities.css`, Button component source |
| Spacing and default elevation | Pinned Tailwind version's defaults plus Studio overrides |
| Component-specific padding/radius | Corresponding `packages/ui` component source at the same commit |

## Ownership and mapping

| Visual role | Existing Lane mapping to retain or verify |
| --- | --- |
| Page/sidebar | `--background`, `--navigation-background` → `--sb-dash-sidebar` |
| Content | `--surface` → `--sb-surface-100` |
| Floating menu | `--surface-raised` → `--sb-overlay`, with overlay border |
| Secondary/muted text | `--text-secondary`, `--text-muted` → Supabase foreground tiers |
| Primary action | `--primary-background` → `--sb-primary-solid`; preserve matching foreground |
| Spacing | `--space-*` → multiples of `--sb-spacing`; select component padding from source |
| Control/menu/panel shape | Semantic role → appropriate Supabase radius; permit size-specific hooks |
| Elevation | Resting/raised/floating hooks → Supabase shadow tokens |
| Button surface | Separate button surface-shadow hooks, rather than assigning elevation shadows everywhere |

Do not copy Supabase React components or install its monorepo UI package. Do not import its full global stylesheet over Arc. Values live once; component CSS consumes roles.

## Task 1: Verify and demonstrate the existing foundation

**Files:** update `docs/design-system/supabase-tokens.md`, `DESIGN.md`, `src/stories/foundations.stories.tsx`; correct `src/styles/supabase-tokens.css` and `src/styles/lane-arc-theme.css` only for demonstrated source mismatches.

**Interface:** existing `--sb-*` names and Arc public tokens remain stable. The deliverable is a source-backed mapping and rendered foundation reference.

- [ ] Fetch the recorded Supabase commit into a temporary reference checkout or through GitHub. Verify the commit resolves before extracting values. If it does not resolve, report that evidence and select a new verified baseline as a separate decision.
- [ ] Record source path, source expression, resolved light/dark value and destination token for each requested category. Resolve alpha colours on their actual surfaces rather than comparing isolated swatches.
- [ ] Extend the existing foundations story with spacing, radius, elevation and button-surface samples. Render real Arc Button/Input/Badge examples beside the tokens.
- [ ] Clarify `DESIGN.md`: Arc is component/behavior authority; Supabase Studio is visual-value authority. Keep current product and accessibility decisions explicit.
- [ ] Compare screenshots and computed styles in both themes at 390 and 1440px. Record actual discrepancies; do not mark values verified from comments alone.

**Acceptance:** every changed token has traceable source evidence, both themes render, and no second palette or theme layer is introduced.

## Task 2: First bounded implementation: shared controls

**Files:** `src/components/arc/button/button.module.css`, `src/components/arc/input/input.module.css`, `src/components/arc/badge/badge.module.css`, `src/styles/lane-arc-theme.css`; create `src/stories/supabase-controls.stories.tsx`; update `docs/design-system/arc-sources.md` and `arc-source-hashes.json` for actual adaptations.

**Interface:** existing Button sizes `sm/md/lg` and variants `primary/secondary/ghost/danger` stay unchanged. Keep the existing height mapping (26/34/38px) unless Task 1 disproves its provenance. New CSS hooks must be optional and preserve plain Arc fallback rendering.

- [ ] Read each component's TSX and CSS, then compare the equivalent Supabase component's padding, border, radius and surface states. Record a small property-level change list before editing.
- [ ] Add the Lane-themed controls story using production imports; leave `controls.stories.tsx` as the plain Arc reference. Include all sizes/variants, icon-only, disabled, pending, long labels, invalid fields and semantic badge tones.
- [ ] Add hooks only for verified gaps. Example pattern for the existing button rule:

```css
/* In Arc's button CSS: retain the existing fallback. */
border-radius: var(--lane-button-radius, var(--radius-control));
/* In the Lane theme: reference the verified Supabase value. */
--lane-button-radius: var(--sb-radius-md);
```

- [ ] Use size-specific hooks when source evidence requires different radii/padding. Map secondary button fill, outline and shadow together so a new inset outline does not accidentally double the existing border. Preserve loading-label geometry and menu-trigger transform safeguards.
- [ ] Document every changed Arc file and refresh only its local hash, retaining the upstream hash and source URL. Do not bulk accept unrelated ledger changes.
- [ ] Run `pnpm design:check`, `pnpm typecheck`, `pnpm lint`, and `pnpm test:storybook -- src/stories/supabase-controls.stories.tsx`.
- [ ] Visually inspect the story in light/dark at 390/768/1024/1440px. Exercise Tab, Enter/Space, disabled and loading states, and reduced motion. Review a representative existing Intake and Requests story for shared-component regressions.

**Acceptance:** controls use verified Supabase values in the five requested categories; Arc APIs and interactions remain intact. Present this result for visual review before moving through the remaining families.

## Task 3: Menus, dialogs and app surfaces

**Files to inspect and adapt only where evidence requires:** `src/components/arc/dropdown-menu/dropdown-menu.module.css`, `src/components/arc/select/select.module.css`, `src/components/arc/dialog/dialog.module.css`, `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`, the shared theme and adaptation ledgers.

**Verification files:** `src/stories/overlays.stories.tsx`, `src/stories/context-menu-nested.stories.tsx`, `src/stories/shell-theme.stories.tsx`, `src/stories/sidebar-project-tree.stories.tsx`.

- [ ] Compare menu/panel padding, item gaps, radius, border, background and shadow with the pinned reference. Distinguish dialog surfaces from dropdown overlays.
- [ ] Apply semantic hooks to verified gaps, one component family per reviewable change. Keep portal behavior, collision handling, focus return, submenu pointer handling and sidebar resize behavior.
- [ ] Verify menus over both sidebar and content surfaces in light/dark, including selected/hover/focus/disabled states and long content.
- [ ] Run source checks and the affected Storybook interactions; inspect all four viewport widths. Check Escape, arrow keys, focus return and overflow.

**Acceptance:** overlays and shell surfaces have consistent Supabase depth and spacing without changing navigation or layout anatomy.

## Task 4: Page-by-page adoption and release evidence

**Files:** existing stories for Requests, Request detail, Intake, Profile, onboarding and auth; affected production CSS only if the visual review identifies a gap. Use `src/stories/design-review.stories.tsx` for the existing review surface rather than adding a route.

- [ ] Review app frame and Requests first, then Request detail, Intake, Settings, onboarding and auth in that order. Finish one screen's review before advancing.
- [ ] Inspect empty/loading/error/success, long content, theme switching and responsive states. Verify selected rows and badges remain distinguishable and labels retain meaning.
- [ ] Apply Clerk styling through its supported appearance API only; distinguish a Storybook appearance review from hosted auth/invitation verification.
- [ ] Run the final checks once after the last accepted change:

```sh
pnpm design:check
pnpm typecheck
pnpm lint
pnpm test
pnpm test:storybook
pnpm build:storybook
pnpm build
```

- [ ] Record screenshots, tested interactions, failures, measured contrast exceptions and unverified provider flows in the existing design-system documentation. Do not disable more accessibility rules to obtain a passing run.
- [ ] Review the final diff for accidental API, data or layout changes. Keep each accepted increment separately revertible; no data migration is involved.

**Acceptance:** every existing MVP screen has review evidence for the requested styling categories; local and hosted verification are reported separately.

## Recommended first approval

Approve Tasks 1–2 as the initial increment: verify the existing tokens and show the shared controls using Supabase styling in Storybook. Tasks 3–4 describe the continuation, with visual checkpoints to keep the change understandable. Planning is complete; implementation and rendered verification have not started.


## Execution checkpoint, 2026-10-16

Tasks 1–2 are ready for review at `http://localhost:6006/?path=/story/design-review-supabase-controls--review`. Source verification succeeded through GitHub's API at the recorded commit, resolving the retrieval limitation above. See `docs/design-system/supabase-tokens.md` and its linked JSON evidence for the comparisons, deliberate differences and checks. Both builds passed. Only buttons, inputs and badges were adapted; the foundation tokens and documentation were corrected alongside them. No deployment or Task 3/4 implementation occurred.


## Application adoption checkpoint, 2026-10-16

User instruction: “now apply this system to the lane app.” This authorizes Tasks 3–4 without a further per-screen approval gate. The app already loaded the shared theme; the approved controls therefore already apply globally. Finished the remaining shared-material gaps in menus, select panels, popovers, dialogs, textareas, password/search fields and Clerk appearance. The app frame, Requests, detail, Intake, Profile and onboarding consume the existing global mapping; no layout rewrite or product-flow change was needed.

Source check, TypeScript, ESLint, diff whitespace check, Storybook build and Next production build passed. Fresh focused browser runs: 29 overlay/context-menu/form/auth tests at light 1440px; 16 overlay/form/approved-control tests at dark 390px with reduced motion; 5 screen smoke tests for Requests, detail, Intake, Profile and onboarding. The latter intentionally skipped 140 other stories. Visually inspected the Requests shell and detail at 1440px dark, Intake at 390px dark, Profile at 768px light, onboarding and the dialog at 1024px light, and live local Clerk sign-in. No horizontal page overflow in the inspected 390/768/1024px screens. Dialog computed light material: dash-sidebar background, 10.6667px radius, shadow-md.

Verification limits: broader page runs stalled and were stopped. The isolated Sidebar Project tree / Create Reveals Project test fails to find the new “Pilot workspace” heading after creation; no styling or product behavior was changed to suppress that failure. Full-suite success is not claimed. Database tests were not rerun for this CSS/appearance-only change. The local app is signed out: authenticated provider journeys and deployment remain unverified. Existing contrast exceptions remain unchanged. Review at `http://localhost:6006/?path=/story/patterns-requests--populated-in-shell&globals=theme:dark`; local app at `http://localhost:3000`.
