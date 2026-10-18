# Shared icon tokens implementation plan

**Goal:** Make application icons use the existing shared size tokens, including icons outside buttons, and prevent fixed JSX sizes from returning.

**Architecture:** Arc foundation supplies a low-specificity icon rule for Lucide and explicitly marked custom icons. Lane maps size roles to the existing Supabase source tokens; Button supplies the size for its children. Existing icon containers retain their semantic colours and interactions.

**Stack:** React, CSS modules, Lucide, Arc, Storybook browser tests, TypeScript AST checks.

## Constraints

- Preserve current component APIs, motion, keyboard interaction and SVG drawing geometry.
- No new icon package, routes, data changes or visual palette.
- Preserve unrelated working changes. No deployment in this pass.

## Work

- [x] Add a browser regression in `src/stories/token-propagation.stories.tsx`: an unsized Lucide icon must render at 16px, size roles must resolve to 12/14/16/18/20/24px, and changing the source tokens must update standalone, nested button and custom icons.
- [x] Add size roles and shared SVG consumers in `src/components/arc/foundation.css`; map them in `src/styles/lane-arc-theme.css`; make Button pass its size through the inherited icon role.
- [x] Audit Arc and application JSX/CSS. Remove numeric icon props and fixed sizing utilities, preserve larger empty-state roles, and distinguish SVG drawing coordinates from rendered dimensions.
- [x] Extend `scripts/design-system/token-contract.mjs` with regression-tested JSX icon checks. Verify the entire production source tree has no violations.
- [x] Run TypeScript, lint, Arc provenance checks, relevant Storybook interactions in both themes and the production build. Inspect Requests, Intake, detail, auth/settings and the component gallery across desktop/mobile layouts.
- [x] Record the adaptation and update hashes only for changed Arc files. Leave the updated detail preview visible.

## Verification

The new browser regression first failed at the unsized icon (24px instead of 16px), then passed with the shared rule. Source-token changes propagate to normal, nested-button and custom icons. Fourteen token-contract tests, the full production source audit, TypeScript, ESLint, Arc source hashes and the production build pass.

Desktop browser batch: 73 passed, one existing profile contrast-helper failure. Dark 390px/reduced-motion batch:seven passed, one existing toolbar-shadow expectation failure. Relevant passing checks include comment posting/loading/rollback, status/priority actions, password visibility, notifications, profile actions, Intake and returning from the range calendar. A larger 19-file run stalled and was stopped; full-suite green is not claimed.

Both failures predate this icon pass and were verified against HEAD: `NormalTextContrast` rejects the existing nonuniform Supabase button sheen before measuring contrast; `ToolbarMenus` expects shadow-lg although its Popover uses the existing shadow-md mapping. No unrelated visual material was changed to satisfy those assertions.

Manual browser review covered dark Intake and its priority menu, light Requests, auth, profile and dark Request detail. Detail was checked at 390/768/1024/1440 widths with no horizontal overflow. Its icons resolve to 14/16px in their control roles. Temporary viewport overrides and the audit tab were removed; the original populated detail tab remains available. This is local verification, with no deployment.
