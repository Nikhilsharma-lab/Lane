# Settings → Profile and Members (plan items 2.9 and 2.10), on the consolidated Settings

**Goal:** Finish what launch-plan items 2.9 and 2.10 still ask for, on top of the Settings that `origin/main` gained on 2026-10-20 (`e1db295`, merged in `790f81a`).

**Source:** `2026-10-10-mvp-launch-linear.md` §5, "2.9 Settings → Profile (S) and 2.10 Settings → Members (S–M), batchable". Batched per decision 8.6. The Profile auto-save is the interaction approved under decision 8.10.

**Direction (Nikhil, 2026-10-20):** build on main's Settings as it is. A first version of this item, built on `0931509` with strip tabs, grouped rows and Clerk embedded in the page, was superseded by that merge and dropped. It is kept only as the local branch `codex/phase-2-9-10-settings-v1-strip-design`, which is not pushed.

## What main already does

| File on `790f81a` | What it does |
|---|---|
| `src/components/settings/settings-command-adapter.tsx` | One Settings frame (Arc Pro Settings Command): a compact `--text-sm` `h1` with a back link, a section sidebar, search, and the sections Profile, Preferences, Security & access, Workspace details, Members, Coming soon. Both `/settings/profile` and `/settings/members` render it. |
| `src/app/(app)/settings/profile/profile-form.tsx` | The role as a compact Select with `autoSave`. |
| `src/components/settings/profile-role-form.tsx` | Auto-save that waited for the server: Select disabled while saving, "Saving role…", a Retry button and an inline alert on failure, "Role updated." toast after the server answered. |
| `src/components/auth/clerk-members-profile.tsx` | Members and Workspace details as cards whose buttons open Clerk's Organization Profile as a modal (`/organization-members`, and the root, which is General). |
| `src/components/auth/clerk-appearance.ts` | `clerkAccountAppearance` for every Clerk modal, with Clerk's navigation visible. |
| `src/components/settings/settings-loading.tsx` | Loading frames for both routes. |

## What this item adds

### 2.9 Profile: the role saves optimistically
- `ProfileRoleForm` with `autoSave` goes through `useOptimisticAction`. The Select and a "Role changed" toast show the new role in the same frame, like Mark Done. Nothing is disabled while saving.
- Saves run one at a time on the overlay id `profile-role`, in the order chosen (`waitForPending`). A choice that was overtaken while it waited is never sent.
- A failure puts back the last role the server confirmed and turns that choice's toast into "Could not save your role" with the reason. Choices queued behind a failure are skipped and go back with it. An expired session refreshes the Clerk token and retries once.
- With no save in flight, a role the server sends is adopted. This covers a refresh after a lost response and a change made in another tab.
- Each choice gets its own toast id, so a toast that is still leaving the screen is never brought back inert.
- The explicit-save form, which takes no `autoSave`, is unchanged.

### 2.10 Members: Clerk's modals at Lane density
- `clerkOrganizationAppearance`, used by both organization modals:
  - Clerk's navigation is hidden, because Lane's sections already choose the page.
  - Table type: `--text-sm` cells and `--text-xs` heads, with `--border-subtle` hairlines.
  - Controls: `--control-height-md` with the md button radius.
  - Weights are capped at medium.
  - Clerk's page and form titles stay. Hiding `header` would also remove the titles of the Invite, Leave and Delete forms.
- The user-profile modals keep `clerkAccountAppearance` and their navigation.
- The plan's "13px rows, 32px buttons, 0.5px borders" predate the 2026-10-13 Supabase tokens. They resolve to Lane's row type, control height and border width.
- No column is added, so there is no "Last seen".
- No layout shift while Clerk loads: Clerk is no longer embedded in the page. The Members card renders on the server, and Clerk opens in its own modal.

## Plan asks that main's design answers differently
- **The 44px strip and strip tabs:** the Settings frame has its own compact heading and a section sidebar. The plan refused "a separate settings sidebar and extra settings pages", and main now has both, plus a Coming soon section. These were Nikhil's merge, kept as built, and are listed for his sign-off.
- **The "label only" helper text:** the compact Role card reads "Your discipline in the team. This doesn't change your permissions." The same meaning is kept, in main's wording.

## Checks
In the PR description and in the 2.9/2.10 row of `docs/design-system/page-quality.md`.

## Pending (Nikhil)
- Visual sign-off at 390, 768, 1024 and 1440 px in both themes.
- A VoiceOver pass.
- The walk-through on the staging build.
- Staging perf numbers.
- Verification of both Clerk modals against the **production** Clerk instance after cutover: the invite, resend and revoke flows, Leave organization, and the hidden navigation.
