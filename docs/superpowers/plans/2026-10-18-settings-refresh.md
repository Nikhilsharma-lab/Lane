# Settings refresh implementation plan

Status: approved by Nikhil in chat on 2026-10-18 and implemented locally. Authenticated Clerk acceptance remains outstanding; no deployment implied.

**Goal:** Give Lane a complete Settings structure with working personal profile, appearance and membership management, plus clearly labeled Coming soon placeholders for future Lane settings.

**Architecture:** Adapt official Arc Pro SettingsCommand source to Lane's existing Profile and Members routes. Preserve Clerk ownership of identity and membership, the existing role action, and browser-local theme storage. Linear supplies interaction and layout reference; Supabase tokens and Geist remain the visual authority.

**Tech stack:** Existing Next.js 16, React 19, Arc Pro, Clerk, next-themes and Lane server actions.

## Brief and constraints

- Audience: signed-in Lane users; Members remains unavailable to guests.
- Job: manage personal information and appearance, or reach workspace membership controls.
- Primary action: edit the relevant setting; no competing page-wide call to action.
- Data: Clerk identity and organization, profiles.role, browser-local theme.
- Surface: existing product Settings routes, with no new routes, tables, AI calls or jobs.
- Keep PM / Designer / Developer labels separate from Clerk admin / member / guest permissions.
- Preserve the existing token system, global focus treatment, icons and reduced-motion behavior.

## Evidence and source fit

Inspected October 18: all 34 destinations in Linear's signed-in Settings sidebar, four notification-channel pages, five team configuration pages and selected menus/dialogs/search interactions. Full evidence, limitations and per-item disposition: [Linear settings browser study](2026-10-18-linear-settings-study.md). Also inspected Arc's live SettingsCommand search-to-Theme interaction, official licensed block source through Arc MCP, current Profile/Members implementations, DESIGN.md and SESSION-STATE.md.

Linear has photo, email, full name, title, username and workspace access. Its email dialog explicitly requires verification and applies across workspaces. No external account data was changed. Linear save behavior was not tested by editing personal data.

Arc SettingsCommand provides section navigation, searchable setting definitions, focus-to-result, responsive rows, save/discard state and reduced motion. Its documented API supports text/select/segmented/switch controls, not arbitrary Clerk panels or profile-image actions. Those need explicit, documented local adaptation, not invented stock props. Arc recommends this block for larger settings collections; use it because Nikhil selected it, without adding settings to justify the component.

Current source has an explicit Save role form, not auto-save. Theme applies immediately. Members embeds Clerk OrganizationProfile with hash routing. The existing SettingsNav contains Profile and Members.

## Proposed scope

| Region | Build and behavior | Owner |
| --- | --- | --- |
| Navigation | Back to Requests, Profile, Appearance anchor within Profile, Members route for eligible users; selected state and mobile navigation | Arc source adapted to existing routes |
| Settings search | Search real rows by label and synonyms; select result to reveal and focus it; hide unauthorized results; empty query suggestions and no-results state | Arc SettingsCommand |
| Account | Display current photo, name and primary email; Manage account opens Clerk's supported profile flow for editing name/photo and verified email changes | Clerk identity; Arc surrounding rows |
| Role | PM / Designer / Developer; auto-save on selection with Saving, Saved and Retry feedback; serialize saves and preserve failed selection | Existing updateProfileRole action |
| Appearance | System / Light / Dark, immediate application and persistence in this browser; no database preference | Existing next-themes integration |
| Workspace access | Display current workspace and membership role distinctly from functional role | Existing session/Clerk context |
| Members | Keep existing Clerk members/invitations and permission enforcement inside the refreshed settings layout | Existing MembersHost / ClerkMembersProfile |

Nikhil's October 18 correction: retain future Lane settings as Coming soon placeholders instead of omitting them. This supersedes the initial plan's blanket exclusion of future categories. Keep every Linear destination accounted for in the linked study; preserve explicit Lane product refusals rather than mislabel them as future commitments.

### Expanded settings structure

- **Personal:** Profile; Preferences (theme works, future preferences labeled); Notifications; Security & access; Connected accounts.
- **Requests:** Labels and Intake templates as Coming soon candidates, using Lane vocabulary.
- **Projects:** Labels and Templates as Coming soon candidates. Configurable statuses and recurring updates remain reference-only under the current product contract.
- **Workspace:** Workspace details, Members, advanced Security, Applications, Billing, Usage & limits, Import & export.
- **Integrations:** Coming soon category with a concise explanation, not a copied marketplace.
- **API:** Coming soon candidate for future developer access, with no key/webhook actions.

Profile's unimplemented username/title/workspace-leaving controls may remain visible as labeled future rows. Preferences candidates include display-name format, comment submit key, week start, sidebar customization, text size, link underlining and motion preference. Fiscal-period configuration is a future candidate connected to Lane's quarter/year contract. All new categories/rows above are proposals in this plan, not claims that their backend is already approved or shipped.

### Placeholder behavior

- Navigation and search distinguish Working from Coming soon. Working settings rank first.
- Selecting a future item opens a compact same-route panel with its title, purpose and Coming soon status. It must not look like a broken page or editable form.
- No fake toggles, persistence, success messages, prices, countdowns, connection flows or security guarantees.
- Keep permission filtering for administration; a placeholder must not leak restricted workspace/member data.
- No separate route/table/AI call/job per placeholder. Preserve existing Profile and Members deep links and browser navigation.
- Explicitly refused features, including member last-seen/online monitoring and individual rankings, remain absent from product UI. Banned/deferred product families such as Initiatives, Pulse, Loops and design-review workflows remain documented in the study rather than promised as Coming soon.

## Arc adaptations

- Install/copy authentic unlocked settings-command source and record provenance in docs/design-system/arc-sources.md.
- Replace demo definitions and simulated saves completely.
- Map source visual literals to existing approved tokens; remove the demo's fixed-height presentation in favor of the app's available height.
- Add a documented composition seam for read-only identity rows and Clerk account actions; preserve default documented APIs for existing control types.
- Adapt navigation for Profile anchors and the existing Members route. Use one settings navigation surface rather than nested duplicate sidebars.
- Use immediate save behavior for role/theme, with per-row status. Do not put theme, Clerk operations and the role database update into a misleading atomic Save all action. The demo save bar is not needed for this proposed interaction.
- Scope keyboard shortcuts so settings search does not also open workspace search; slash inside text inputs must type normally. Escape closes only the topmost overlay and restores its trigger focus.

## Implementation sequence after approval

1. **Settings frame and search.** Read the relevant installed Next.js guides. Install authentic Arc source without overwriting existing modified primitives. Add the settings adapter and real searchable catalog, wire existing routes and responsive navigation. Verify keyboard opening, arrows, Enter, Escape, no results, guest result filtering and focus return before adding account behavior.
2. **Profile and appearance.** Reuse the current role action and theme storage. Add Clerk identity display and supported Manage account entry point after checking the installed Clerk API and enabled instance capabilities. Convert role saving to serialized auto-save; retain the selected value and offer retry on failure, mark saved only after success. Refresh displayed Clerk identity after changes. Keep identity editing in Clerk's own flow.
3. **Members integration and verification.** Reuse ClerkMembersProfile and MembersHost with the shared navigation. Preserve server-side guest rejection and provider-managed invitation controls. Exercise the same production components in Storybook and then verify configured Clerk flows in an authorized development/staging account.

## File map

- New: src/components/settings/settings-command-adapter.tsx and settings-catalog.ts for Lane composition and searchable entries.
- New: src/components/settings/coming-soon-panel.tsx for the shared future-setting state. Catalog entries carry availability, section, keywords and destination; no placeholder receives a save handler.
- New: src/components/settings/account-profile.tsx for Clerk identity and Manage account entry.
- New official source: src/components/arc/blocks/settings-command/ with recorded token/API adaptations.
- Modify: src/app/(app)/settings/settings-nav.tsx; profile/page.tsx and profile/theme-preference.tsx.
- Modify: src/components/settings/profile-sections.tsx, profile-role-form.tsx and profile.module.css.
- Modify as required for settings-specific navigation: src/components/shell/sidebar-view.tsx; preserve Requests navigation behavior.
- Reuse: src/app/(app)/settings/profile/actions.ts, src/components/auth/clerk-members-profile.tsx and members-host.tsx.
- Update coverage: src/stories/profile.stories.tsx; add settings search/navigation stories and focused behavioral tests beside the adapter.
- Update docs: Arc provenance and shared session handoff after implementation, with verified versus outstanding provider checks.

## State and acceptance checklist

| Region | Loading / missing data | Failure | Success / limited access |
| --- | --- | --- | --- |
| Account | Stable skeleton, initials fallback, explicit unavailable value | Provider error and retry; never fake a verified email | Updated Clerk values; focus returns after closing account flow |
| Role | Current saved role; prevent duplicate in-flight writes | Keep selection and show Retry | Saved only after persistence; labels never alter access |
| Theme | Hydration-safe System fallback | Retain usable UI if browser storage is unavailable | Immediate theme; System follows device changes |
| Search | Local catalog; useful suggestions | No results message and editable query | Visible destination, focused control; no restricted results |
| Members | Existing provider loading/empty states | Provider errors remain actionable | Invitations/roles remain Clerk-controlled; guests denied server-side |

- [ ] Deep links to both existing routes work; Back to Requests works; no new route is required.
- [ ] Failed save and rapid repeated role selection cannot display a false saved state or stale final value.
- [ ] Theme survives reload, has no hydration flash introduced by the change, and remains browser-local.
- [ ] Identity management does not write a parallel local identity record or bypass email verification.
- [ ] Search and workspace shortcuts do not both fire; focus never remains in a hidden palette.
- [ ] Future entries are searchable, labeled Coming soon before selection, keyboard-accessible and backed by the shared placeholder panel; none can mutate data.
- [ ] Every Linear sidebar item has an explicit working/candidate/reference-only disposition in the study; no deferred item silently disappears and no refused feature becomes a delivery promise.
- [ ] Test light/dark, 390/768/1024/1440 widths, long name/email, keyboard-only and reduced motion.
- [ ] Run pnpm typecheck, pnpm lint, pnpm design:check, targeted settings Storybook tests and pnpm build. Run role action tests only with the repository's disposable-local-database safeguards.
- [ ] Record provider/staging checks separately from local Storybook checks; no deployment implied.

Approval of this proposal would cover the account-management entry point, settings navigation/search, role auto-save and layout integration above. Implementation should remain a single bounded Settings increment.

## Implementation and local verification — October 18

Implemented the expanded catalog, Arc Pro command palette, permission-filtered navigation, Profile/Preferences/Security/Workspace panels and shared Coming soon state. Existing routes remain canonical; `section` query navigation supports history. Profile identity opens Clerk; role uses the existing action with serialized auto-save and retry; theme uses the existing browser preference. Members retains Clerk OrganizationProfile and server-side guest rejection. Loading routes share the new frame. No schema or action authority changed. The old Profile/Members layout components remain for legacy stories; current routes use the adapter directly.

Passed: production build, typecheck, lint, design contract/source checks; UI suite 32 files / 296 tests; Settings + app-frame browser run 25 tests before adding the in-flight save case. All 8 new Settings/auto-save stories pass after adding that case. Responsive checks exercised 390, 768, 1024 and 1440 widths, light/dark and reduced motion; contrast follows the existing Supabase-token exception. Current Profile/search/Billing placeholder visually inspected in Chrome.

Broader legacy Profile run: 12/13 passed, including theme storage behavior. `NormalTextContrast` fails because its contrast helper rejects a non-uniform gradient. No token changes were made to bypass it; this is not a clean full-Storybook claim.

Real app at localhost:3000/settings/profile redirects to login. Account edit/verified email, Members invitation and return-focus acceptance in an authenticated Clerk session remain unverified. Local preview at localhost:6007 uses sample identity and simulated role persistence; Manage account is disabled there. Product routes use real Clerk and the existing server action. No provider data was changed.

Final shared-checkout caveat: after the successful build/typecheck, a concurrent edit appeared in `src/stories/existing-request-measurement.stories.tsx` (not authored by this Settings session). The final typecheck reports four unsupported `exact` options at lines 23–26 in that file only; Settings files have no reported errors. This unrelated work was left untouched.

## Settings polish and live-app handoff — October 18 follow-up

Nikhil rejected the initial visual composition and requested the actual app plus signed-in account/Members checks. Consolidated all future items (including inline Profile, preference and workspace placeholders) into one Coming soon destination, preserving search, permission filtering and legacy future-section URLs. Working navigation is Profile, Preferences, Security & access, Workspace details and Members. Replaced large production role radio cards with the existing Arc Select/Button; theme uses the shared SegmentedControl. Removed redundant labels/cards and aligned identity, role and workspace rows on the existing token scale. Legacy control presentations remain for previous stories.

Actual app opened at localhost:3000/settings/profile, redirecting to login. User sign-in was requested asynchronously; the tab reached Google's account chooser. Do not choose an account for the user or claim account/invitation verification. After sign-in: return to /settings/profile; inspect Manage account, provider security and modal focus return; inspect Members list and invitation form without sending invitations or changing privileges; check the real app at desktop/mobile and leave Settings open.
