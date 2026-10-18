# Shared Claude / Codex handoff

Updated 2026-10-18. This is the shared engineering handoff, not a new product specification. Read `AGENTS.md` and `REQUIREMENTS.md` for authority; older plans and chat completion claims are historical evidence.

## Continue here

- Checkout: `/Users/nikhilsharma/Documents/Work/Lane`.
- Consolidation branch: `codex/consolidate-sessions-2026-10-18`.
- Existing session work is checkpointed in `21fc764`; it includes the notification fix inherited from `9075791`.
- Remote main was fetched on October 18 at `0e283e6`. Its missing picker fixes are integrated without restoring the retired design-review workflow.
- Use one editing session at a time in this checkout. Before switching Claude/Codex, record the current commit, uncommitted files, remaining work and checks here. Parallel work needs isolated worktrees and an explicit integration owner.
- This consolidation is local. No push, deployment, production migration or live acceptance check is implied.

## Work preserved together

| Work | Source / current record |
| --- | --- |
| Supabase tokens, shared icon/control enforcement and Arc adaptations | `docs/design-system/supabase-tokens.md`; plans dated October 16 and October 18 for global tokens, shared icons and control consistency |
| Shared app/Storybook sidebar configuration and Request presentation | Current shell/components and Storybook fixtures |
| Request detail, measurement summaries, priorities and status controls | `docs/superpowers/plans/2026-10-16-request-detail-polish.md` and current components |
| Creator editing of Open Requests | `docs/superpowers/plans/2026-10-18-edit-open-request.md` |
| Rich authenticated workspace search | `docs/superpowers/plans/2026-10-18-rich-workspace-search.md` |
| Design reviews retired in favor of design links | October 18 decision in `REQUIREMENTS.md`; retain historical data |
| Add link reveals and focuses the related-link field | Current Intake form and composer regression story, captured during consolidation |
| Notification rows retained while refreshing | Commit `9075791` |

## Reconciliation decisions

- Keep the newer design-link-only adapter when merging older Ask for review code. Do not restore review actions or the old review panel to the product.
- Keep main's shared Project-picker keyboard handling and inert closed popovers.
- Retain the existing token-based disabled opacity; remove the duplicate literal opacity rule introduced by merging main.
- Fix the integration between the shared sidebar and composer: after closing a composer opened from collapsed navigation, return focus to the visible Expand sidebar button. The old fallback only recognized Open navigation. Update the mobile regression to use the actual shared sidebar and await its reveal animation.
- Remove the obsolete source-text assertion requiring the retired review adapter to save. Existing `LegacyEntryIsLinkOnly` browser coverage and no-storage review-action tests cover the current boundary directly.
- Do not merge `codex/requests-search` (`45336b3`): its September 25 standalone toolbar and old component foundation predate the current workspace search. The branch remains recoverable; this is superseded implementation, not lost work.
- Other historical local branches are already ancestors of fetched main. Do not merge them again.
- The Claude `wt-mainfix` worktree contains a file explicitly marked TEMPORARY EXPERIMENT for bundle measurement and diagnostic stories. Preserve these separately; do not ship them. The detached `wt-base-5ef88ba` also has diagnostic stories. Neither worktree has unique commits beyond main.
- Leave historical branches/worktrees intact until the consolidated result is accepted. Their presence does not make them active development locations.

## Recovery

`backups/session-consolidation-2026-10-18/` is an ignored local recovery folder. It contains all Git refs in `all-refs.bundle`, a manifest identifying six worktrees, and each worktree's tracked patch and untracked-file archive. Environment files, dependencies and other ignored files are not copied. A second copy is at `/private/tmp/lane-consolidation-20261018/`.

## Verification and remaining work

Fresh local verification on October 18:

- Full application suite: **97 files / 1,016 tests passed**, using guarded disposable localhost `lane_test`.
- TypeScript, full ESLint, changed-file ESLint after the final focus fix, and whitespace checks passed.
- Token contract: **16 tests passed**; application CSS/icon/control audit and Arc provenance passed (70 files, 65 adaptations).
- Production build passed after the final product-code fix; 18 static pages generated. This is a local build, not deployment evidence.
- Affected browser run: 200/201 passed across composer, Intake, workspace search, detail, design links, sidebar resize, priority and token stories. The remaining mobile composer case exposed the focus integration described above. After correction, the focused composer focus/Escape/link/mobile run passed **5/5**. The whole 201-case run was not repeated after that narrow fix.
- No new live-account or hosted acceptance run was performed. Earlier plan test counts remain historical evidence.
- The mobile focus regression also passed at 390px in dark mode with reduced motion.

The only deliberately untracked file left by consolidation is `debug-storybook.log`; it is included in the recovery archive and is not product source.

Production isolation, hosted acceptance, accessibility sign-off and other launch gates remain governed by the canonical launch/cutover documents. Consolidation does not close those gates or implement the target alignment/outcome pipeline.
