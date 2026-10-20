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
| `src/components/auth/clerk-appearance.ts:22-29` | `clerkEmbeddedAppearance`: only strips the card's frame. Clerk keeps its own type scale (h2 title at Clerk's `lg` size, bold) and its own input and button heights. Its spacing is Clerk's `1rem` default and is not tied to Lane's tokens. |
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
- **The card's rhythm.** The card's gap is `$8` (`elements/Card/CardContent.js:44`) and its form's gap is `$6` (`elements/Form.js:47`). Title and subtitle sit in a column with gap `$1` (`elements/Header.js:29`), against Lane's `--space-3`.

## What this item changes

### 1. Clerk appearance tuned to the auth column (`clerk-appearance.ts`)
`clerkEmbeddedAppearance` is used by `SignIn`, `SignUp` and both session tasks. It keeps `clerkNeutralVariables`, so `colorRing` stays `--focus-outline`. It adds:
- **Spacing:** `spacing: calc(var(--sb-spacing) * 4)`. Clerk's internal gaps become Lane's `--space-*` scale: card `$8` = `--space-8` (heading to form, as `auth.module.css:5`) and form `$6` = `--space-6` (field to field, as the recovery form).
- **Type scale:** `md` = `--text-sm` (Lane's auth body, labels and inputs), `xs`/`sm` = `--text-xs`, `lg`/`xl` = `--text-base`. These are the same steps 2.10 gave the organization modals. Weights stop at medium, except for the title below.
- **Title (`headerTitle`):** the same tokens as Lane's own auth title (`auth.module.css:7`): `--font-display`, `--text-2xl`, `--leading-display`, `--tracking-display` and the title weight. Login, signup, forgot and reset then share one title.
- **Subtitle (`headerSubtitle`):** `--text-sm` at `--leading-body` in `--text-secondary`. A top margin of `calc(var(--space-3) - var(--space-1))` adds to Clerk's `$1` column gap, so the title-to-description gap is Lane's `--space-3`.
- **Inputs (`formFieldInput`):** `--control-height-md` with no block padding, `--text-sm`, `--radius-control`, which is Arc's Input as the recovery form draws it (`arc/input/input.module.css:5`).
- **Primary button (`formButtonPrimary`):** `--control-height-md`, `--button-radius-md`, `--text-sm` at `--weight-medium`, which is Arc's md Button (`arc/button/button.module.css:2,36`). Colour stays `colorPrimary` / `colorPrimaryForeground`: `--primary-background` / `--primary-label`.
- **Social buttons (`socialButtonsBlockButton`):** the same control height, radius and type, so the column has one control height.
- Clerk keeps its header, copy, footer, alignment and every step. No element is hidden.

**Plan values resolved to tokens.** The plan's numbers predate the 2026-10-13 Supabase token decision, so they resolve to Lane's tokens, as 2.10 resolved its own:
- "24px title" becomes `--text-2xl`: Supabase's 1.375rem, 22px (`supabase-tokens.css:668`). That is Lane's existing auth title.
- "36px inputs" becomes `--control-height-md`: Supabase's `size-small`, 34px (`supabase-tokens.css:725`). That is the height of every Arc Input and md Button in Lane, the recovery form's included.
- "Primary button tokens" become `--primary-background`, `--primary-label`, `--button-radius-md` and `--control-height-md`.
- `colorRing` becomes `--focus-outline`. This was already true on main and is now covered by a test.

**The title weight.** Lane's auth title uses `--sb-font-weight-semibold` (`auth.module.css:7`), and Clerk's title uses the same so the four pages match. Arc's checklist allows only 400 and 500. Whether the auth title should drop to medium is listed for Nikhil and not changed here.

### 2. The reset link is hidden while a session task is open (`login/page.tsx:18-24`)
- `SignInResetLink` (in `clerk-sign-in.tsx`) reads `useSession()`. It hides "Forgot your password? Reset it" while `session.currentTask` is set, and while Clerk has not yet loaded and so cannot say whether a task is open.
- The link keeps its place: `AuthHeaderLink` gains `concealed`, which applies `visibility: hidden`. This takes it out of the tab order and the accessibility tree, and the header never reflows.
- Signed-out visitors see the link appear together with Clerk's card. Someone resuming a task never sees it.

### 3. `loading.tsx` for login, and one frame per auth page
- `src/components/auth/auth-frames.tsx` adds three frames:
  - `LoginFrame`: the header action passed in, plus the login trust line.
  - `SignupFrame`: the signup trust line.
  - `RecoveryFrame`: "Remembered it? Sign in" and the recovery trust line. Forgot and reset now share one source.
- The page, its `loading.tsx` and Clerk's `fallback` all render inside the same frame, so only the card ever changes.
- `src/app/(auth)/login/loading.tsx` is new: `LoginFrame` with `SignInResetLink` and the card skeleton. `signup/loading.tsx` uses `SignupFrame`, so its trust line no longer appears late.

### 4. The card's space is reserved
- `AuthCardSkeleton` (in `auth-loading.tsx`) draws the Clerk card at the tokens set in section 1:
  - the title line at `--text-2xl` × `--leading-display`, and a subtitle line, `--space-3` apart;
  - `--space-8` below them, one social button at `--control-height-md` and an "or" divider line;
  - each field as a label line plus an outlined control, `--space-6` apart;
  - the primary button and Clerk's footer action line.
- The title line is the Arc Skeleton itself and carries the one `status` ("Loading sign in" and so on). The rest is `aria-hidden`, in the pattern `app-skeletons.module.css` uses for `/intake`.
- It is the `fallback` for `SignIn` (one field), `SignUp` (two fields) and `TaskResetPassword` (two fields, no social button), and the content of both `loading.tsx` files.
- `TaskChooseOrganization` falls back to the generic `AuthLoading`, because its card is a list rather than a form.
- The skeleton assumes one social button, because the instance local development uses offers Google sign-in (`docs/SESSION-STATE.md:162`). Whether production matches, and the exact card height, can only be seen against a real Clerk instance. CLS ≤ 0.02 is therefore measured by Nikhil on the staging production build.

### 5. Spacing on forgot and reset aligned
- `password-recovery-view.tsx` drops its Tailwind utilities for `auth.module.css` classes:
  - `.recoveryForm`: `--space-6` between fields, notices and actions, the same gap as Clerk's form after section 1.
  - `.recoveryActions`: `--space-2` between Resend and Change email, two columns from 640px (Supabase's `sm`).
- Together with section 1 and the shared `RecoveryFrame`, every auth page uses one rhythm: title to description `--space-3`, heading to form `--space-8`, field to field `--space-6`, paired actions `--space-2`, card to trust line `--space-6`.

## Tests and stories
- **`clerk-appearance.test.ts`:** the embedded appearance reads every value from a token, with no px, rem or hex literals. `colorRing` is `--focus-outline` and never `--focus-ring`. The title uses `--text-2xl`, and inputs and the primary button use `--control-height-md`. Spacing is tied to `--sb-spacing`. No header element is hidden. The organization and account tests stay as they are.
- **`auth-frames.test.ts` (new):**
  - `SignInResetLink` is concealed while Clerk is loading and during either task, and shown with no task (mocked `useSession`).
  - The login loading state renders the same frame and trust line as the page, with one status.
  - `ClerkHashSignIn`, `SignUp` and `TaskResetPassword` pass the card skeleton as Clerk's `fallback`.
  - Forgot and reset share `RecoveryFrame`.
- **`password-recovery-contract.test.ts`:** the `/forgot-password` link check now reads `clerk-sign-in.tsx`, where the link lives.
- **`src/stories/auth-arc.stories.tsx`:** Login Loading, Login During Session Task (the link takes no space change and is not reachable) and the new Signup Loading. Recovery stories render in `RecoveryFrame`.

## Pending (Nikhil)
- Visual sign-off at 390, 768, 1024 and 1440 px in both themes, against a real Clerk instance. Clerk's card cannot render without one, so it was not seen locally.
- A VoiceOver pass: the hidden reset link is skipped, the skeleton announces once, and the focus ring on Clerk's fields comes from `--focus-outline`.
- Staging perf: login and signup CLS ≤ 0.02 at 1440 and 390.
- After the production Clerk cutover:
  - a real password reset and a real invitation return on **production**;
  - auth JS does not regress from the 257–271 KB gzip measured in the plan, plus the Clerk runtime;
  - production's sign-in methods match the skeleton (one social button).
- Decisions:
  - the auth title weight (semibold today, against Arc's 400/500);
  - whether Clerk's centred header should be left-aligned like Lane's recovery heading. It is not changed here.
