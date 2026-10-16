# Notifications Reopen Implementation Plan

**Goal:** Reopen the existing Notifications popover immediately with its last loaded list while refreshing it.

**Architecture:** Keep the existing component's in-memory list for its mounted lifetime. Refresh on every open through the existing abortable GET routes. A failed refresh preserves rows and offers Retry. No persistence, new endpoint or schema.

**Tech Stack:** React 19, Next.js, Arc Popover, Supabase visual tokens, Storybook Vitest.

## Scope

First bounded slice of launch-plan step 2.7. Keep workspace authorization, read-state actions and navigation intact. Remaining 2.7 work: optimistic read/unread, J/K navigation, Request code/problem labels, Done capitalization and empty-state copy. No Inbox route.

## Implementation

- [x] Add `ReopenKeepsLoadedNotifications` to `src/stories/notifications.stories.tsx`, using the production adapter with a held second GET. Assert old rows remain visible without a loading spinner; fail that GET, verify rows plus retry; retry returns updated rows.
- [x] Run the story against current code and confirm it fails on retained-row visibility.
- [x] In `src/components/shell/notification-bell.tsx`, remove `loaded` from the open-effect guard/dependencies and do not reset it on close/navigation. Retry invokes `refreshList()` explicitly. Continue aborting reads on close.
- [x] Run notification browser stories, TypeScript, targeted lint and design source check.
- [x] Open the Storybook case for visual review and commit this slice on `codex/notifications-popover`.

## Verification commands

```sh
pnpm exec vitest run --config vitest.storybook.config.ts --no-file-parallelism src/stories/notifications.stories.tsx
pnpm typecheck
pnpm exec eslint src/components/shell/notification-bell.tsx src/stories/notifications.stories.tsx
pnpm design:check
```

## Evidence

Main consolidation: `8c90e07`, pushed to origin/main. Production build, 273 UI tests, 21 review stories, TypeScript, lint and Arc source check passed before starting this slice.

Notifications: the new story first failed because reopening removed the loaded rows. After the fix, all 9 notification stories pass, including keyboard, error/retry and read-failure navigation. The dark Storybook preview was manually inspected. Targeted lint and Arc source check pass. A concurrent untracked `src/stories/intake-to-detail.stories.tsx` initially blocks the shared checkout typecheck with an optional `affectedPeople` field; that unrelated file is excluded from the isolated notification verification and left untouched.

The isolated TypeScript check passed with only the concurrent Intake-to-detail story excluded (`/tmp/lane-notifications-tsconfig.json`). This is not a claim that the shared checkout's full typecheck passes.
