# Page quality ledger

One line per page or plan item, from the per-page definition of done in
`../superpowers/plans/2026-10-10-mvp-launch-linear.md` §2.4. `.impeccable/` is
gitignored, so the summary lives here.

- **Critique:** an Impeccable critique. The gate is 0 P0 and 0 P1; a score of
  28/40 or more is advisory.
- **Detector:** `impeccable detect` over the item's changed UI files.
- **Staging perf:** the item's `e2e/perf.spec.ts` numbers on the staging
  production build, as p75.

| Item | Date | Detector | Critique | Staging perf | Visual approval |
|---|---|---|---|---|---|
| 2.0 App frame and states | 2026-10-11 | 0 findings over 22 changed files | Pending | Pending: detail CLS at 1440 and 390, list CLS at 390, click to skeleton (budget 100 ms) | Pending (Nikhil) |
| 2.1 Requests welcome and 2.2 Onboarding | 2026-10-11 | 0 findings over 17 changed files; review fixes: 0 findings over 10 files | Pending | Pending: first Request CLS at 1440 and 390, role saved to welcome in one navigation (the onboarding e2e, which needs Clerk) | Pending (Nikhil): visuals, the onboarding copy, and one-click role choice (not built). Applied, not pending: the recorded one-Intake-link rule (`../superpowers/plans/2026-09-29-requests-welcome.md`), so the empty page has one New Request, the welcome's; the strip's stays hidden and inert in its box until the first Request |
| 2.3 New Request composer and `/intake` | 2026-10-11 | 0 findings over 21 of 22 changed UI files and the 5 changed story files. `src/components/arc/dialog/dialog.module.css` reports one bounce-easing finding on the upstream bare-Radix keyframe line, which this item did not change (the base reports it too) | Pending | Pending: C to focused title on the first open (budget 100 ms, also at 4x CPU), Review Request to the checking status (100 ms), long frames in the drawer's entrance at 4x CPU (≤ 2), `/intake` cold-load CLS at 1440 and 390 (≤ 0.02). Local Storybook only, dev build at 1x: C to focused title 61 to 73 ms on the first open and 15 to 23 ms on a reopen; the drawer's tween settles about 250 ms after it starts to move, after a first frame of 67 to 83 ms that mounts the form | Pending (Nikhil): visuals, the VoiceOver pass and the walk-through; "Show it" moving to the Open view and the row's Project; auto-opening the composer after a reload that lost uploads |
