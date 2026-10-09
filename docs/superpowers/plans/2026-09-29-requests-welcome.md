# Requests welcome implementation plan

**Goal:** Give an empty Requests workspace one clear path into Intake.

**Architecture:** Render a server component before the list/detail shell only when the accessible Request collection is empty and no detail is requested. Existing populated, filtered, unavailable, loading and error flows stay intact. A shadcn Base UI Accordion explains an illustrative reframe without saving demo data. The server-rendered welcome uses shadcn Empty and ReUI Frame source.

**Stack:** Existing Next.js, React, shadcn/Base UI buttons, Typography, Lucide and semantic Tailwind tokens. No packages or routes added.

## Reference and scope

- Plane project-issues empty state distinguishes active filters from true emptiness; detailed-empty-state uses restrained text/action hierarchy, responsive actions and native button semantics. List root delegates loading/recovery to its layout HOC. Use patterns only, no Plane code.
- Actual free registry source imported: shadcn base-nova Empty and Accordion, plus ReUI base-nova Frame. See `docs/free-ui-components.md` for provenance and adaptations.
- Paper MCP is unavailable. Use a rendered local component preview for desktop/mobile and light/dark review.
- No tenancy, identity, database, lifecycle, or route changes. Preserve pre-existing edits. Admin-only invitation shortcut; guest-specific language.

## Steps

- [x] Add regression coverage for actual empty-workspace rendering, filtered/populated states and unavailable deep links, with database/session boundaries isolated.
- [x] Build `requests-welcome.tsx`: shared page header, focused welcome, one Intake CTA, three workflow steps, optional illustrative example, admin invitation shortcut.
- [x] Select it in `requests-workspace.tsx` for an empty accessible collection without a selected Request; retain existing selection and filter behavior otherwise.
- [x] Render the real component locally and inspect phone/desktop, dark/light, native disclosure and keyboard focus. Check type safety, targeted lint, relevant tests and diff.

## Acceptance

No zero-count/filter/select-a-Request placeholders in a truly empty workspace. Exactly one Intake link; the example never creates data. Non-admins have no invitation shortcut. Existing Requests continue to use the existing workspace shell. No production or staging deployment.

## Initial implementation verification (before library rebuild)

- Six server-rendered regression cases passed: admin/member/guest first use, empty status filter, unavailable deep link, and populated list. The three first-use cases failed before implementation on duplicate Intake links.
- Existing focused suite: 87 tests across 16 files passed without database setup.
- TypeScript, targeted ESLint and `git diff --check` passed.
- Real welcome component rendered with compiled Lane CSS and Geist, in a representative preview shell. Browser checks at 1440px desktop, 390px mobile and 320px narrow mobile covered light/dark, guest language, native disclosure via Enter and visible keyboard focus. No horizontal overflow at 320/390/1440px; mobile Intake action is 48px tall.
- Preview: http://127.0.0.1:4317/admin-light.html (temporary local server; Intake and Members links lead to existing staging routes). The preview shell is illustrative; existing application chrome is unchanged.
- No hosted database operations, authenticated end-to-end rerun, production build, or deployment performed.

## Library rebuild

User requested actual free-library composition. Replaced custom welcome/disclosure containers with shadcn Empty, shadcn Base UI Accordion, and ReUI Frame. Added ReUI registry configuration and retained MIT notices. Six landing regression tests, TypeScript and targeted lint passed after integration. Browser validation follows against a live React-rendered component preview; preview navigation is illustrative and route links point to staging.

Library rebuild verification: 87 existing focused tests passed after integration in addition to six landing regressions. TypeScript, targeted ESLint and diff checks passed. Live React preview confirmed the real Base UI trigger expands with Enter, reports aria-expanded, and retains visible keyboard focus. Expanded content fits at 320px; desktop fits at 1440px; mobile primary action is 48px. Light and dark previews inspected. No deployment or authenticated full-app browser rerun.
