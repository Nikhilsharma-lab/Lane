# Beta copy, roadmap choices, and landing wireframe

**Goal:** Make Lane's current product understandable, expose the remaining roadmap as decisions, and review a low-fidelity landing page before implementation.

**Architecture:** Copy-only changes in existing app and marketing surfaces. A separate conversation wireframe is a proposal, not a new app route. Canonical roadmap files remain authoritative.

**Tech stack:** Existing Next.js/React/TypeScript, Base UI/shadcn primitives; self-contained HTML for the review wireframe.

**Global constraints:** Preserve Cursor's uncommitted auth/database changes. No new routes, schema, AI calls, permission changes, deployments, or invented customer/results claims. Keep Requests, Intake, Open / In Progress / Done and functional role labels. Production readiness is not inferred from staging evidence.

## Tasks and acceptance

1. Inventory customer-facing source: auth, onboarding, Intake/review/attachments, Requests, detail/comments, notifications, Members, Profile, loading/errors, metadata, and the existing `marketing/` page.
   - Fix unclear or misleading text without changing behavior.
   - Leave provider-controlled text and overlapping unfinished auth work explicitly identified.
   - Inspect Plane patterns and local UI primitives before editing; no component replacement.
2. Present a dated roadmap decision menu derived from REQUIREMENTS, lane-roadmap, and DEFERRED.
   - Separate beta release gates, local/unreleased work, selectable increments, conditional later work, and refused features.
   - Do not grant new build authority or overwrite roadmap decisions.
3. Produce a rough landing wireframe in Lane's existing visual language.
   - Show the actual Intake mechanism and shared Requests lifecycle, with illustrative data labeled.
   - Include one proposed beta-access action, a product example, scope/FAQ, and final CTA.
   - No philosophical slogans, invented logos/testimonials, pricing, ROI, or enterprise assurances.
   - Paper tools are unavailable this session; use an inline review artifact, not production implementation.
4. Verify changed copy in context; run applicable existing tests, lint, and TypeScript checks without hosted mutations.
   - Prose-only edits do not need brittle exact-wording tests; preserve existing semantic/accessibility contracts and update intentional stale copy assertions where necessary.
   - Check wireframe desktop/mobile, keyboard controls, overflow, and theme.

## Landing direction contract

**Mode:** Persuade. Audience: design leads and product teams collecting design requests.

**Thesis:** Explain the request workflow through a concrete example, rather than a philosophy statement.

**Visual authority updated 2026-09-30:** Use Harvey colours only and official shadcn preset b0 for other styling, as recorded in `DESIGN-NOTES.md`. This supersedes this plan's earlier Gallery Light/Night Studio palette and Geist-like type direction. The copy and rough structural proposal below remain historical work, not approval of a marketing implementation.

**Story:** Understand what Lane does, inspect how an ask becomes a confirmed problem, then decide whether to join the free beta.

**First viewport:** Short headline and one CTA beside an illustrative request/reframe comparison. Shared Requests preview follows the workflow explanation.

**Form:** User-requested rough wireframe, code-led; no high-fidelity concept tournament or production landing build.

**Finish:** Reviewable at desktop and mobile widths; all claims bounded to current scope; unresolved access-policy and legal/support links called out before a real launch.

## Delivery and copy audit — 28 September 2026

### Local changes

- Removed philosophical slogans from the app auth shells and the existing marketing page. Preserved internal product principles, layout, and permission rules.
- Marketing now explains the current product: collect design requests, clarify the problem with AI, and track work from Open to Done. Demo content is labeled illustrative; a displayed Request count now matches its three rows.
- Intake headings describe the next action. AI results ask the person to review the framing rather than claiming the problem is objectively clear. Draft restoration distinguishes saved text/links from files that must be selected again.
- Upload, comment, download, lifecycle, and page-error messages identify the failed action and a relevant retry. Removed unsupported reassurance such as “Your Request is safe.”
- Requests empty/filter states no longer imply other Requests exist. Assignment says “Picked up” rather than suggesting exclusive ownership.
- Onboarding and Profile consistently use PM / Designer / Developer and explain that the label does not change access. Validation text now correctly describes an inclusive character limit.
- Updated metadata and existing copy-sensitive tests/selectors. Cursor's overlapping auth/database implementation was preserved; edits in those auth files were limited to prose.

Source coverage included auth shells, onboarding, Intake/classification/recovery/uploads, Requests/filter/detail/comments, Members wrapper, Profile/theme, notifications, loading/error states, metadata, and the existing marketing page. The staging Intake page was inspected. This was not a fresh end-to-end browser test of every authenticated state.

### Remaining issues, not hidden by copy changes

1. **Notification failure handling:** `src/components/shell/notification-bell.tsx` treats a structured fetch failure as a loaded empty list; rejected fetches lack a catch. This can falsely show “No notifications yet” or remain loading. A nullable Request title can also appear as “null.” These need a small behavioral fix and regression tests.
2. **Profile save recovery:** a rejected save in `src/app/(app)/settings/profile/profile-form.tsx` has no local recovery message. This is a behavior issue, not just wording.
3. **Provider-owned copy:** hosted Clerk forms, emails, and account-portal text were not changed. They require configuration and live journey review, not edits to Lane's strings.
4. **Social image:** `marketing/public/og.png` still contains the older “Clear requests. Better design work.” headline. Text metadata is updated; the raster asset needs a separate replacement before publishing the revised marketing page.
5. **Launch configuration:** beta access policy and real Privacy / Terms / Contact destinations must be confirmed before implementing the proposed landing page. The wireframe's CTA is a harmless prototype action.

These findings do not authorize deployment or establish production readiness. The beta gates are listed in [the roadmap decision menu](./2026-09-28-roadmap-menu.md).

### Verification

- Main app: **87 tests across 16 files passed**, using a temporary Vitest configuration with database-reset global setup disabled. Coverage: existing UI/auth, Intake, attachment, Requests, comment, lifecycle, draft, and validation contracts.
- Main app: full `tsc --noEmit --incremental false` and ESLint across `src` and `e2e` passed.
- Marketing: build and **2 rendered-HTML tests passed**; lint passed. Standalone type checking remains blocked by existing Cloudflare binding types (`cloudflare:workers`, `Fetcher`, and `D1Database`) in unchanged infrastructure files.
- Both repositories: `git diff --check` passed. The app copy pass's Impeccable detector returned no findings.
- Wireframe: desktop and narrow-screen browser checks completed; at a 320px host viewport the artifact had equal client/scroll widths (288px), with no horizontal overflow. Reframe disclosure worked from the keyboard; beta CTA showed prototype-only feedback; in-page navigation did not create nested frames. Dark-mode tokens are present, but a separate dark visual QA pass was not completed.
- No shared-Clerk E2E tests, hosted database operations, commits, pushes, or deployments were performed.

### Design references and delivery

The landing structure uses a concrete product explanation, a visible example, and a clear next action, following [Nielsen Norman Group's homepage guidance](https://www.nngroup.com/articles/homepage-design-principles/). [Linear Asks](https://linear.app/asks) was a workflow-presentation reference, not a source of additional feature promises. The Plane empty-state pattern and Lane's local UI primitives were inspected; no component system was replaced.

Paper MCP was unavailable. The review artifact is a local, self-contained HTML wireframe, not a new route or production component:

`/Users/nikhilsharma/.codex/visualizations/2026/07/12/019f550b-7725-7682-a706-efff59729a01/lane-beta-landing-wireframe.html`
