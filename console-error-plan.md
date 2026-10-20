# Console Error Fix Plan — Lane App

## Goal
Fix all console errors across every page of the Lane application, page by page, ensuring no runtime errors appear in Chrome DevTools Console.

## Approach
1. **Page-by-page analysis** — examine each route/component for console.error sources
2. **Systematic root cause identification** — unhandled promises, missing props, API failures, React state issues
3. **Fix each error** with minimal, targeted changes
4. **Verify** by running the app and checking the console

## Page Structure (from App Router)
- `/` → `RequestsWorkspace` (requests-overview.tsx)
- `/login` → `LoginPage` ((auth)/login/page.tsx)
- `/signup` → ((auth)/signup/page.tsx)
- `/forgot-password` → ((auth)/forgot-password/page.tsx)
- `/reset-password` → ((auth)/reset-password/page.tsx)
- `/onboarding` → `RoleForm` ((auth)/onboarding/page.tsx)
- `/intake` → `IntakePage` ((app)/intake/page.tsx) + `IntakeForm` ((app)/intake/intake-form.tsx)
- `/requests/[id]` → `RequestDetailPane` ((app)/requests/[id]/page.tsx)
- `/settings/profile` → ((app)/settings/profile/page.tsx)
- `/settings/members` → ((app)/settings/members/page.tsx)

## Known Console Error Sources (pre-investigation)

### 1. `src/app/(app)/intake/intake-form.tsx`
- `window.setTimeout` calls at lines 423, 521, 699, 1006, 1014, 1264
- `window.requestIdleCallback` at line 123
- Potential unhandled errors from `runTriage`, `saveRequest`
- `useEffect` cleanup returning `undefined` at line 90 (`formPromise` rejection)
- `onBusyChange` callback that may reference stale state

### 2. `src/app/(app)/requests/[id]/page.tsx` (request detail)
- `loadRequestDetail` calls that may return null
- `RequestDetailPane` props that may be undefined if `selected` is falsy
- Lifecycle buttons, comment forms, attachment downloads

### 3. `src/components/requests/` — data table, list state
- `DataTable` component interactions
- `list-view-state` context providers
- Pending mutations provider

### 4. `src/components/arc/` — UI components
- Toast stack, dialogs, dropdowns, tooltips
- User menu memory timers
- Context menu hover timers

### 5. `src/lib/` — data loading and utilities
- `ensure-workspace.ts` — workspace/member lookups
- `auth-guard.ts` — authentication guards
- Various API call wrappers

## Page-by-Page Action Plan

### Phase 1: Auth Pages (login, signup, onboarding)
- [ ] Check `/login` — ClerkSignIn integration, auth-shell components
- [ ] Check `/signup` — sign-up flow
- [ ] Check `/forgot-password` / `/reset-password` — password recovery
- [ ] Check `/onboarding` — RoleForm, role selection, keyboard shortcuts

### Phase 2: Intake / New Request Page
- [ ] Check `/intake` — IntakeForm component
  - Fix `window.setTimeout` references that may fire after unmount
  - Fix `requestIdleCallback` promise rejection
  - Ensure all `useEffect` cleanups properly cancel timers
  - Fix triage gate API call error handling
  - Fix save request error handling
- [ ] Check form field focus setTimeout calls

### Phase 3: Requests List Page
- [ ] Check `/` — RequestsOverview, DataTable
  - Fix `useRequestListContext` undefined values
  - Fix `usePendingMutations` interactions
  - Fix `fetchOlderDone` error handling
  - Fix project filter unavailable rendering
  - Fix empty state welcome interactions

### Phase 4: Request Detail Page
- [ ] Check `/requests/[id]` — RequestDetailView
  - Fix `loadRequestDetail` null returns
  - Fix lifecycle buttons with undefined request status
  - Fix comment form submissions
  - Fix attachment download errors
  - Fix priority/expected impact display

### Phase 5: Settings Pages
- [ ] Check `/settings/profile` — Profile settings
- [ ] Check `/settings/members` — Member management

### Phase 6: UI Components (arc/)
- [ ] Check toast-stack timers
- [ ] Check dropdown-menu hover timers
- [ ] Check context-menu timers
- [ ] Check user-menu memory timers

### Phase 7: Lib/Data Layer
- [ ] Check `ensure-workspace.ts` — possible undefined returns
- [ ] Check `auth-guard.ts` — guard conditions
- [ ] Check request data fetchers — error propagation

## Priority Order (by likely console error frequency)
1. **Intake form** — most complex, most `setTimeout`/`requestIdleCallback` usage
2. **Request detail** — API calls, null returns
3. **Requests list** — data loading, context values
4. **Auth pages** — Clerk integration
5. **Settings** — simpler, fewer dynamic elements
6. **Arc UI components** — timer management

## Verification
After fixes, run `npx next dev` and navigate each page, checking Chrome DevTools Console for:
- `console.error` messages (we'll eliminate these)
- Unhandled promise rejections
- JS errors in the DevTools "Errors" tab
- Network errors that surface as console messages