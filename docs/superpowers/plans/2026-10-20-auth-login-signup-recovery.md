# Auth: login, signup, forgot/reset (plan item 2.11)

**Goal:** Finish launch-plan item 2.11 on `origin/main` at `ce0bd7f` (PR #54 merged). The auth column reads as one surface. Clerk's card takes Lane's type, control height, primary button and spacing. Nothing moves while Clerk loads. The reset link is hidden while a Clerk session task is open.

**Source:** `2026-10-10-mvp-launch-linear.md` §5, "2.11 Auth: login, signup, forgot/reset (M)", and the quality bar in §2.1 ("Crisp"), §2.3 (motion, no layout shift) and §2.4 (per-page definition of done; Storybook is a design-system reference, not a gate).

**Scope rules:** no new routes, schema or dependencies. Clerk keeps every auth step, its copy, and all authorization. `clerkAccountAppearance` and `clerkOrganizationAppearance` are not changed. No file under `src/components/arc/` changes.

## What main does today (file:line on `ce0bd7f`)

| File | What it does |
|---|---|
| `src/app/(auth)/login/page.tsx:18-24` | The header always shows "Forgot your password? Reset it", including while `ClerkSessionTasks` (`:31`) renders Clerk's choose-organization or reset-password task. |
| `src/app/(auth)/login/` | Has no `loading.tsx`. |
| `src/app/(auth)/login/page.tsx:25-29`, `signup/page.tsx:11-15` | Each route writes its own trust line. |
| `src/app/(auth)/signup/loading.tsx:5` | Its `AuthShell` has no trust line, so the line appears when the page arrives. |
| `src/components/auth/clerk-sign-in.tsx:14-23` | `ClerkHashSignIn`: Clerk's `SignIn` with no `fallback`. |
| `src/components/auth/clerk-sign-in.tsx:25-51` | `ClerkSessionTasks` reads `useSession()` (`:30`) and renders `TaskChooseOrganization` (`:32-39`) or `TaskResetPassword` (`:41-48`), with no `fallback` either. |
| `src/app/(auth)/signup/page.tsx:17-22` | Clerk's `SignUp`, with no `fallback`. Until Clerk mounts, each of these components draws nothing. The column then holds only the trust line, and when the card arrives the vertically centred column moves (`auth.module.css:3`). |
| `src/components/auth/clerk-appearance.ts:5-20` | `clerkNeutralVariables`: colours, font and radius from Lane tokens. `colorRing` is already `var(--focus-outline)` (`:15`), not the transparent `--focus-ring` (`lane-arc-theme.css:44-45`). |
| `src/components/auth/clerk-appearance.ts:22-29` | `clerkEmbeddedAppearance`: only tries to strip the card's frame, with Tailwind classes that Clerk's styles outrank. Clerk keeps its own type scale (h2 title at Clerk's `lg` size, bold) and its own input and button heights. Its spacing is Clerk's `1rem` default and is not tied to Lane's tokens. |
| `src/components/auth/clerk-appearance.ts:33-46`, `:48-85` | Account and organization appearances (2.10). Unchanged here. |
| `src/app/(auth)/forgot-password/page.tsx:14-25`, `reset-password/page.tsx:16-29` | The same header link and trust line, written twice. |
| `src/components/auth/password-recovery-view.tsx:39` | The recovery form spaces itself with Tailwind's `grid gap-6`. |
| `src/components/auth/password-recovery-view.tsx:116` | The Resend / Change email pair uses `grid gap-2 sm:grid-cols-2`. The values match Lane's 4px grid, but they are not Lane tokens and nothing ties them to the Clerk card. |
| `src/components/auth/auth.module.css:4-7` | Column gap `--space-6`, heading-to-form `--space-8`, title-to-description `--space-3`. The title is `--text-2xl` in `--font-display`, at `--leading-display` and `--tracking-display`. |
| `src/components/auth/auth-loading.tsx:4-6` | A generic four-line Arc Skeleton. |
| `src/stories/auth-arc.stories.tsx:14-37` | Stories for the recovery steps and the signup and members loading states. |
| `src/stories/onboarding.stories.tsx` | Onboarding. Its shell and loading state are untouched. |
| `src/app/(auth)/password-recovery-contract.test.ts:25` | Source-checks that the login page links to `/forgot-password`. |
| `password-recovery-flow.test.ts`, `password-recovery-form.test.ts` | The recovery state machine and the screens for each step. Their behaviour is unchanged here. |

What Clerk does (installed source):
- **The fallback.** In `@clerk/react` 6.16.1, `SignIn`, `SignUp`, `TaskChooseOrganization` and `TaskResetPassword` accept `fallback` (`dist/index.d.mts:84-90`, `:202-209`). They render it on the server and until Clerk's component has mounted. They hide their own root while it shows (`dist/hooks-*.mjs`, `withClerk` with `renderWhileLoading` and `ClerkHostRenderer`).
- **The spacing variable.** In `@clerk/ui` 1.33.1, `variables.spacing` is a CSS length that Clerk multiplies inside `calc()` (`customizables/parseVariables.js:84-87`; the default is `1rem`, `foundations/sizes.js:4,213-222`). So Clerk's `$N` equals Lane's `--space-N` when spacing is `calc(var(--sb-spacing) * 4)`.
- **The card's rhythm.** The card's gap is `$8` (`elements/Card/CardContent.js:44`). Sign-in's main column is `$6`, and its form puts the fields at `$6` and the button `$8` below them (`components/SignIn/SignInStart.js:405-421`). Title and subtitle sit in a column with gap `$1` (`elements/Header.js:29`), against Lane's `--space-3`. Main's `p-0 border-0 shadow-none bg-transparent` classes on the card are Tailwind utilities, which sit in a cascade layer. Clerk's styles are unlayered, so they win; Clerk's documented way to drop the frame is `options.elevation: "flush"` (`internal/appearance.d.ts`, `elements/Card/CardRoot.js:2-37`).

## What this item changes

### 1. Clerk appearance tuned to the auth column (`clerk-appearance.ts`)
`clerkEmbeddedAppearance` is used by `SignIn`, `SignUp` and every session task. It keeps `clerkNeutralVariables`, so `colorRing` stays `--focus-outline`. It adds:
- **Flush card:** `options: { elevation: "flush", logoPlacement: "none" }`.
  - Main stripped the frame with Tailwind class strings. Tailwind v4 utilities sit in a cascade layer, and Clerk's styles are unlayered (no `cssLayerName` in `layout.tsx`), so Clerk's styles win.
  - Clerk's documented `flush` elevation drops the border, radius, outer padding and footer band, and spaces the footer `$8` below the card (`@clerk/ui` `elements/Card/CardRoot.js:2-37`).
  - `cardBox` is `width: 100%` and `maxWidth: 100%`, so at 390px the card fills the column instead of Clerk's `100vw - $10`.
  - There is no Clerk logo, because the header already carries Lane's mark.
- **Spacing:** `spacing: calc(var(--sb-spacing) * 4)`, so Clerk's `$N` becomes Lane's `--space-N`:
  - heading to form `$8` (`--space-8`, as `auth.module.css:5`);
  - fields to the button `$8` (`Form.Root`, `SignIn/SignInStart.js:417`);
  - between fields, and between the social button, the divider and the form, `$6` (`--space-6`).
- **Type scale:** `md` = `--text-sm` (Lane's auth body, labels and inputs), `xs`/`sm` = `--text-xs`, `lg`/`xl` = `--text-base`. These are the steps 2.10 gave the organization modals. Weights stop at medium, except the title below.
- **Title (`headerTitle`):** the same tokens as Lane's own auth title (`auth.module.css:7`): `--font-display`, `--text-2xl`, `--leading-display`, `--tracking-display` and the title weight. A test holds the two together.
- **Subtitle (`headerSubtitle`):** `--text-sm` at `--leading-body` in `--text-secondary`. A top margin of `calc(var(--space-3) - var(--space-1))` adds to Clerk's `$1` column gap, so the title-to-description gap is Lane's `--space-3`.
- **Inputs (`formFieldInput`):** `--control-height-md` with no block padding, `--text-sm` and `--radius-control`, which is Arc's Input as the recovery form draws it (`arc/input/input.module.css:5`). Focus answers with the border colour alone, as Arc's Input does (`:8`): Clerk's 4px focus halo, which also showed on pointer focus, is removed.
- **Primary button (`formButtonPrimary`):** `--control-height-md`, `--button-radius-md`, and `--text-sm` at `--weight-medium`, which is Arc's md Button (`arc/button/button.module.css:2,36`). Its colours are `--primary-background` and `--primary-label` through the variables. Hover is `--primary-hover-background`, as Arc's primary (`:20`), instead of a shade Clerk derives.
- **Social buttons (`socialButtonsBlockButton`):** the same control height, radius and type.
- Clerk keeps its header, copy, alignment and every step. No element is hidden.

**Plan values resolved to tokens.** The plan's numbers predate the 2026-10-13 Supabase token decision, so they resolve to Lane's tokens, as 2.10 resolved its own:
- "24px title" becomes `--text-2xl`: Supabase's 1.375rem, 22px (`supabase-tokens.css:668`). That is Lane's existing auth title.
- "36px inputs" becomes `--control-height-md`: Supabase's `size-small`, 34px (`supabase-tokens.css:725`). That is the height of every Arc Input and md Button in Lane, the recovery form's included.
- "Primary button tokens" become `--primary-background`, `--primary-label`, `--primary-hover-background`, `--button-radius-md` and `--control-height-md`.
- `colorRing` becomes `--focus-outline`. This was already true on main and is now tested. It colours the ring on Clerk's buttons and links. Clerk's inputs show focus with their border, like Arc's.

**The title weight.** Lane's auth title uses `--sb-font-weight-semibold` (`auth.module.css:7`), as do Lane's base headings in `globals.css`, and Clerk's title follows it so the four pages match. Arc's checklist allows only 400 and 500. That is an app-wide decision for Nikhil, so it is not changed here.

### 2. The reset link is hidden while a session task is open (`login/page.tsx:18-24`)
- `HiddenDuringSessionTask` (`session-task-gate.tsx`) is a small client component. It reads `useSession()` and `useClerk().status`.
- It hides its children while `session.currentTask` is set, and while Clerk has not loaded and so cannot say whether a task is open. If Clerk fails to load (`status === "error"`), there is no task to protect and the link shows.
- `/login` gives it the server-rendered `LoginResetLink` ("Forgot your password? Reset it").
- `AuthHeaderSlot` (`auth-header-slot.tsx`) keeps the link's place with `visibility: hidden`. That takes it out of the tab order and the accessibility tree without reflowing the header.
- `isLoaded` is false on the server and in the hydration snapshot, so server and client markup match.
- Signed-out visitors see the link arrive with Clerk's card. Someone resuming a task never sees it.

### 3. `loading.tsx` for login, and one frame per auth page
- `src/components/auth/auth-frames.tsx` adds three frames:
  - `LoginFrame`: the header action passed in, plus the login trust line.
  - `SignupFrame`: the signup trust line.
  - `RecoveryFrame`: "Remembered it? Sign in" and the recovery trust line. Forgot and reset now share one source.
- The page, its `loading.tsx` and Clerk's `fallback` render inside the same frame, so only the card ever changes. A test asserts that, before Clerk loads, `/login` and `/signup` render the same markup as their loading states.
- `src/app/(auth)/login/loading.tsx` is new: `LoginFrame` with the reset link held hidden in its place, as the page keeps it until Clerk loads, plus the card skeleton.
- `signup/loading.tsx` uses `SignupFrame`, so its trust line no longer arrives late.
- `/login/page.tsx` is now a server component. The frame and its links render on the server, and only Clerk's card and the session check ship as client code.

### 4. The card's space is reserved
`AuthCardSkeleton` (`auth-card-skeleton.tsx`) draws the flush Clerk card at the tokens set in section 1:
- the centred title line at `--text-2xl` × `--leading-display`, and a subtitle line `--space-3` below it;
- `--space-8` below those, the main column at `--space-6`: one social button at `--control-height-md`, the "or" divider and the form;
- in the form, fields at `--space-6` (each a label line over an outlined control) and the primary button `--space-8` below them;
- the footer action line `--space-8` below.

Where it is used:
- It is the `fallback` for `SignIn` (one field), `SignUp` (two fields), `TaskResetPassword` (two fields, no social button) and `TaskChooseOrganization` (no fields, no social button). It is also the content of both `loading.tsx` files. So the route's loading state, Clerk's fallback and a task's fallback all share one shape.
- It is one `role="status"` with the wait's name ("Loading sign in" and so on); every bar is `aria-hidden`.
- It is plain server markup in the Arc Skeleton's fill, with no client code and no animation. The Arc Skeleton would have brought its motion code into `/login` twice, once for the loading state and once for Clerk's fallback (+5 KB measured). With no animation there is nothing for reduced motion to stop.

Limits:
- The skeleton assumes one social button, because the instance local development uses offers Google sign-in (`docs/SESSION-STATE.md:162`).
- Whether production matches, and the card's exact height, can only be seen against a real Clerk instance. CLS ≤ 0.02 is therefore measured by Nikhil on the staging production build.

### 5. Spacing on forgot and reset aligned
`password-recovery-view.tsx` drops its Tailwind utilities for `auth.module.css` classes in Clerk's form rhythm:
- `.recoveryFields`: fields, notice and error at `--space-6`.
- `.recoveryForm`: the actions `--space-8` below the fields, where they were `--space-6`.
- `.recoveryActionGroup`: the submit button and the Resend / Change email pair at `--space-6`, as before.
- `.recoveryActions`: `--space-2` within the pair, in two columns from 640px (Supabase's `sm`).

Together with section 1 and the shared `RecoveryFrame`, every auth page uses one rhythm: title to description `--space-3`, heading to form `--space-8`, field to field `--space-6`, fields to the button `--space-8`, paired actions `--space-2`, card to trust line `--space-6`.

## Tests and stories
- **`clerk-appearance.test.ts`** covers the embedded appearance:
  - every value comes from a token, with no px, rem or hex literals;
  - `colorRing` is `--focus-outline` and never `--focus-ring`;
  - the card is flush through Clerk's options, with no utility-class strings;
  - the title uses `--text-2xl` and matches `auth.module.css` `.title`;
  - inputs and the primary button use `--control-height-md`;
  - there is no input halo, and hover uses `--primary-hover-background`;
  - spacing is tied to `--sb-spacing`;
  - no header element is hidden.

  The organization and account tests stay as they are.
- **`auth-frames.test.ts`** (new):
  - The gated reset link is concealed while Clerk loads and during either task. It shows with no task, and when Clerk fails to load (mocked `useSession` / `useClerk`).
  - `/login` and `/signup` render the same markup as their loading states before Clerk loads, with one status.
  - `ClerkHashSignIn`, `SignUp` and both tasks pass a card skeleton as Clerk's `fallback`.
  - Forgot and reset share `RecoveryFrame`.
- **`password-recovery-contract.test.ts`:** login renders `<HiddenDuringSessionTask><LoginResetLink /></HiddenDuringSessionTask>`, and `LoginResetLink` links to `/forgot-password`.
- **`src/stories/auth-arc.stories.tsx`:**
  - new: Login Loading, Login During Session Task (the link keeps its box but cannot be reached or tabbed to) and Reset Task Loading;
  - updated: Signup Loading now draws the card skeleton, and the recovery stories render in `RecoveryFrame`.

## Bundle
Measured on Next 16.3.8 against a same-version build of `origin/main` (`ce0bd7f`):
- `/login` is +3.9 KB gzip, over the 2 KB budget.
  - Without `login/loading.tsx` it is +0.4 KB. A loading boundary gets its own client chunk, and Turbopack puts a second copy of `next/link` in it, because the page's chunk keeps its own copy.
  - Avoiding that would take a Link-free copy of `AuthShell` for the loading state.
  - Nikhil can accept it with a waiver, or drop `login/loading.tsx`. `/login` is static (`○`), so its loading state shows only on a client navigation that has not prefetched.
- `/signup` is −4.4 KB, `/reset-password` +0.8 KB, `/forgot-password` and `/onboarding` +0.3 KB, `/settings/*` +0.2 KB, and every other route is unchanged.

## Pending (Nikhil)
- Visual sign-off at 390, 768, 1024 and 1440 px in both themes, against a real Clerk instance. Clerk's card cannot render without one, so neither the card nor how closely the skeleton matches it was seen locally.
- A VoiceOver pass: the hidden reset link is skipped, the skeleton announces once, and Clerk's fields announce focus through their border.
- Staging perf: login and signup CLS ≤ 0.02 at 1440 and 390.
- After the production Clerk cutover:
  - a real password reset and a real invitation return on **production**;
  - auth JS does not regress from the 257–271 KB gzip measured in the plan, plus the Clerk runtime (the gzip first-load figures above include Clerk's bundled UI);
  - production's sign-in methods match the skeleton (one social button).
- Decisions:
  - the `/login` bundle waiver, or dropping its loading state;
  - the auth title weight (semibold, app-wide, against Arc's 400/500);
  - whether Clerk's centred header should be left-aligned like Lane's recovery heading. It is not changed here.

## Follow-ups (not built)
- **The `setup-mfa` task.** Clerk 6.16 ships `TaskSetupMFA`. If that task is ever enabled, `ClerkSessionTasks` falls through to `SignIn`, and `taskUrls` in `layout.tsx` has no entry for it. The gap predates this item; the reset link is hidden during it.
- **Clerk failing to load.** The card skeleton then stays up and keeps announcing "Loading sign in". That was a blank card before this item. A `ClerkFailed` message would need copy and a decision.
- **Light-theme skeleton fill.** `--skeleton-fill` resolves to `--sb-surface-300`, which in the light theme is nearly the page background. Every Lane skeleton is faint there, this one included.
