# Request split pane implementation plan

**Goal:** Make a Request row behave consistently and show its detail beside the list, matching the supplied Inbox reference.

**Architecture:** Keep DataTable's preview controller, existing detail loader, permissions and draft memory. Replace absolute preview geometry with an in-flow dock. Preserve full-page links, row menus and keyboard navigation. Polar extraction is a separate reference artifact, not authorization to replace Lane's palette.

**Tech stack:** Next.js 16, React 19, Arc UI, CSS Modules, existing theme and Motion tokens.

## Scope and regions

- Row: code/title/blank area toggle the same preview. Actual checkbox/property/menu controls retain their labelled actions. Copy code stays in the menu and detail strip.
- Layout: list on the left, detail on the right, a shared divider and independent scrolling. At narrow widths retain full-page navigation; no new overlay.
- Header: reuse PageStrip's existing Arc buttons/tooltips, code, Copy and Open full page actions. Arc page-header is a composition reference; its demo tabs/progress do not represent Lane data.
- Body: existing Goal, Journey, Iterations and files. Arc Timeline is for chronological events, not replacement of the ordered lifecycle Journey.
- Conversation: keep saved/pending comments and retained drafts with Arc Avatar/Textarea/Button. Do not add CommentThread's unsupported replies, reactions, edit/delete or resolve.
- Dock: adapt the inspected licensed ai-side-panel's in-flow dock/inner panel structure, using Lane theme names. No assistant, AI calls, scrim or sheet.
- States: loading skeleton, failed read/retry, unavailable Request, read-only reader, long content, selected row, closed pane, focus return and reduced motion.

## Execution

- [x] Demonstrate the existing failures in the actual-component browser fixture; add E2E assertions for row-body/code toggling, nested controls, draft retention and pane geometry. The E2E spec itself remains unrun.
- [x] Update request-row.tsx, DataTable capture handler, RequestPeek and their CSS. Keep mouse modifiers and Enter/full-page navigation intact.
- [x] Adapt Inbox's preview slot to the shared in-flow pane and same-item toggle; verify its panel exactly fills the slot and scrolls independently.
- [x] Verify local components with fixture data: code/title/blank clicks, checkbox independence, Space/J/Escape, focus return, retained draft, 390/768/1024/1440 widths, and light/dark. Phone navigation intent is observed through the fixture's router adapter, not an actual Next page navigation.
- [x] Run TypeScript, changed-file ESLint, 59 focused UI tests, theme/source/brand contracts and diff whitespace check. Repository-wide ESLint fails on 29 existing require-import errors in backup scripts.
- [x] Save Polar browser variables, source definitions and comparison report with evidence limits: 150 non-empty colour variables on the dark Metrics page, 106 resolved through public globals.css and 44 through its imported Tailwind 4.3.3 theme; all 150 match within one sRGB byte.

## Evidence and remaining boundary

Artifacts and the local component fixture live at `/Users/nikhilsharma/.codex/visualizations/2026/11/02/01a19a52-3374-77f2-bd8c-5e59e18ec977/`. Preview: `http://127.0.0.1:3229/` (Inbox via the preview link). `pane-before.json`, `pane-after.json`, `inbox-pane-check.json`, and dark/light screenshots record the browser checks.

The fixture composes the actual DataTable, RequestPeek, RequestDetailPane and InboxScreen with local server-action/fetch/router stand-ins. No signed-in local database walk, full Next production build, end-to-end suite, hosted role checks or deployment was performed. The existing loading/error UI was observed; server authorization, saved mutations, upload recovery and VoiceOver itself are not reverified by this fixture.

No routes, schemas, permissions, lifecycle changes, deployments or hosted data writes.

## Follow-up: row switching and richer Arc content

The user reproduced a missed case: clicking a different Request closed the pane.
Native focus had already changed the preview before the toggle handler ran. The
fix follows keyboard navigation explicitly and leaves native pointer focus out of
preview selection. CUA reproduced the failure before the change and verified
switching, same-row close, unrelated checkbox focus, retained drafts and J/Space/Esc
after it. The E2E spec now covers different rows as well.

The requested sources are now materially incorporated: page-header supplies a
fixed title/metadata/section-navigation composition; the official Timeline is
installed with theme-token adaptations and displays saved event timestamps; the
comment-thread source supplies article, author/time, body and composer structure.
Lane keeps its posting/draft controller and existing Journey actions. Section jumps
scroll only the pane body, preserving its header and the list. The fixture has
distinct problem descriptions per Request.

Verified 95 focused UI tests (eight files), typecheck, focused ESLint and all design,
source and brand checks. Browser checks include 768/1024 widths and light/dark.
Final screenshots: `request-pane-rich-dark.png`, `request-pane-rich-light.png`.
The earlier hosted/build/end-to-end verification boundaries remain.

## Approved actual-app integration (2026-11-02)

Nikhil subsequently approved wiring the reviewed preview into the actual app.
The shared component wiring is retained. The Polar palette now lives in the single
product theme file, with a complete pasted export and matching Lane additions;
the earlier preview-only colour boundary is superseded. The fixture no longer
imports its own palette. Real Request/Inbox loaders and mutation guards remain.

Header navigation is now controlled Arc/Radix tabs, keeping inactive forms mounted.
Conversation uses the full official CommentThread with Lane's existing composer.
The final production build, 93 focused UI tests and 51 design tests pass. The built
app's sign-in theme was checked at localhost:3230. A signed-in local-database walk
is still pending because reusable Clerk test memberships have no matching local
workspace. No remote resources or data were changed, and nothing was deployed.
