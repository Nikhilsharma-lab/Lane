# Leftover build plan: what the MVP launch plan still needs built

**Date:** 2026-10-21. **Base:** `origin/main` at `a9cac1b` (after #61).

**Source:** `2026-10-10-mvp-launch-linear.md`. Phases 1a, 1b and 2 (2.0 to 2.11) are built; production cutover ran on 2026-10-20 (`docs/SESSION-STATE.md`). This plan covers only what is left to **build**. Verification, sign-offs and dashboard steps are listed at the end, not planned here.

**Decision (Nikhil, in chat, 2026-10-21):** build everything left except the marketing landing page (§6.4, decision 8.27) and the full Storybook matrix with visual compare and Linux baselines (§6.4). That message is also the explicit written decision `AGENTS.md` and `DEFERRED.md:214-226` require before the Request peek is built, and it selects both 2.12 items (decision 8.24's "not for the MVP" default is overridden).

## Already done, so not in this plan
- Statement-count ceilings run in CI: `pnpm test` includes `src/app/(app)/requests/[id]/statement-ceilings.test.ts` and `src/lib/data/loaders.test.ts`.
- `pnpm test` also runs every UI test file (`vitest.config.ts` includes `src/**/*.test.ts`), so `test:ui` needs no separate CI step.
- Security headers (`next.config.ts` `headers()`, K1/K2), error reporting (`src/instrumentation.ts`, `src/lib/error-reporting.ts`), the startup env check (`src/lib/env.ts`), the privacy policy (`/privacy`), localhost redirect origins limited to non-production (G10), the cutover runbook.
- Favicon, icons, manifest and OG image, and retiring stale e2e specs and orphan PNGs (#61, merged).

## The work

| # | Item | Plan source | Effort | Touches | Needs Nikhil |
|---|---|---|---|---|---|
| L1 | Terms of service page | §6.1 P1–P5; §7.3 go/no-go | S | new `src/app/terms/*`, the auth shell's footer link | Approve the text before merge |
| L2 | Bundle gate in CI | §2.4 item 6; Phase 1b exit | S | `.github/workflows/test.yml`, `docs/design-system/bundle-baseline.json` | A written waiver for the re-baseline |
| L3 | Vercel Speed Insights | §6.1 M5; decision 8.13 | S | `package.json`, `src/app/layout.tsx`, `/privacy` text | Approve the privacy line; enable in the Vercel dashboard |
| L4 | ⌘K command palette, existing actions only | §5 2.12; decision 8.24 | M | shell keyboard handling, a new palette component, `src/lib/keyboard-shortcuts.ts` | Sign-offs as for any page |
| L5 | Request peek | §5 2.12; `DEFERRED.md:214-226` | M–L | Requests list, detail composition, `src/lib/keyboard-shortcuts.ts` | Sign-offs as for any page |

### L1 Terms of service
- A public `/terms` page built like `/privacy` (same shell, module CSS, effective date), linked from the shared auth shell next to Privacy.
- Content uses only facts already approved for the privacy policy: operator "Nikhil Sharma in India", contact `uselaneapp@gmail.com`, a free invite-only pilot with no payment (`AGENTS.md`, free pilot section). It covers: who may use Lane, accounts and workspaces (Clerk), acceptable use, the AI check and that its output is a suggestion, content ownership and the workspace licence to host it, availability during a pilot, suspension and termination, deletion (pointing to the approved Privacy procedure), disclaimers and liability, changes to the terms, governing law, contact.
- Any commitment not already approved (governing law and courts, liability cap, minimum age) is listed in the PR as a question; nothing is published until Nikhil approves the text in the PR.
- Done: route renders in both themes at 390 and 1440, linked from login, signup and privacy; story or test for the page; typecheck, lint, design:check, tests, build.

### L2 Bundle gate in CI
- A CI job (or a step in `checks`) that runs `pnpm build` with placeholder env values, never real secrets, then `pnpm bundle:check`.
- `bundle-baseline.json` is re-baselined to `origin/main` at the time of the PR, because main is already 27 to 98 KB over the committed baseline since the 2026-10-20 Settings consolidation (recorded in the 2.9/2.10 row of `page-quality.md`). The re-baseline carries a written waiver in the PR and in `page-quality.md`, for Nikhil to approve by merging.
- Done: the job fails a PR that grows any route by more than 2 KB gzip, and passes on main.

### L3 Speed Insights
- Add `@vercel/speed-insights` (decision 8.13's default, approved with the plan on 2026-10-10) and mount `<SpeedInsights />` in the root layout, production only.
- Check the CSP (Report-Only) allows its same-origin endpoint.
- Add one sentence to `/privacy` saying Vercel collects anonymous page-performance metrics. The policy was approved text, so the change is listed in the PR for Nikhil's approval.
- Dashboard: Nikhil enables Speed Insights on the `lane` project.
- Done: build passes, the component renders only in production, bundle growth recorded.

### L4 ⌘K command palette
- ⌘K (Ctrl+K) opens a palette of actions that already exist; no new capability: go to All Requests, a Project, No Project, a status view, Notifications, Settings sections; New Request; open a Request by code (`LAN-12`) or title through the existing search; theme. It respects the keyboard guards (`src/lib/keyboard-guards.ts`), never fires inside text fields or open overlays, and appears in the `?` overlay.
- Arc first: reuse the installed Arc Pro `settings-command` palette pieces and Arc Dialog; record any Arc edit in the ledger. Guests see only what they can do.
- Loaded on first use (and preloaded on idle) so no route grows more than 2 KB.
- Done: stories for open, filter, keyboard path, Esc and focus return, guest; VoiceOver pass pending; the usual checks.

### L5 Request peek
- From the Requests list, open a Request in a side peek without leaving the list: the list keeps its place, filters and selection. The full page `/requests/[id]` stays the canonical URL and is one action away (Enter or a button in the peek).
- The peek reuses the detail view's existing islands (properties, lifecycle actions, comments, attachments) and the pending-mutation overlay, so a change made in the peek shows in the row in the same frame.
- Keyboard: a key opens the peek on the focused row, J/K move it, Esc closes it and returns focus to the row. Phones keep full-page navigation.
- `DEFERRED.md`'s peek entry moves to built, with this decision.
- Done: stories for open, move, act, close and focus return, guest, phone; bundle within budget or a written waiver; the usual checks.

## Order and parallel work
- L1, L2 and L3 touch different files and can run at the same time. L3 edits `/privacy`, so L1 must not.
- L4 and L5 both add entries to `src/lib/keyboard-shortcuts.ts` and the `?` overlay, so they run one after the other: L5 first (it changes the list), then L4.
- Each item is its own PR to `main`, following the working rules of the earlier items: work in a worktree, never in the main checkout; no `.env.local` for builds; no new routes beyond `/terms`, no schema; Arc edits recorded; bundle measured against a same-version build of `origin/main`; an independent review; a `page-quality.md` row with sign-offs pending.

## Not in this plan
- **Excluded by Nikhil:** the marketing landing page; the full Storybook matrix with visual compare and Linux baselines.
- **Verification, not building:** production workspace isolation (J8a), invite auto-return, a real reset and email deliverability on production, D8 Supabase cleanup, the S1 boxes, weekly backups, launch QA (§7.1), pilot zero.
- **Nikhil's sign-offs** for 2.0 to 2.11, the uptime monitor, and the Speed Insights dashboard toggle.
