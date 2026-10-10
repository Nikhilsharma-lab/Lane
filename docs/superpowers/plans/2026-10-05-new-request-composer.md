# New Request composer

Approved 2026-10-05: adopt Linear's contextual creation flow using actual free ReUI source. This changes the existing Intake presentation, not the Request contract.

## Bounded implementation

1. Install and inspect free ReUI `c-dialog-1` in an isolated source directory, preserving existing component implementations. Record source hashes and deliberate adaptations.
2. Replace Intake's mandatory wizard with title + description, optional supporting details/files, and the existing AI confirmation in one composer. Reuse current action and attachment controllers. Keep `/intake` as a direct-entry page using the same form.
3. Mount a person/workspace-scoped, state-preserving composer in the authenticated layout. Existing New Request links open it; modified/new-tab links retain `/intake`. Add `C` outside editable elements and other overlays. On success close, refresh the current view and offer Open Request.
4. Preserve unfinished text and selected files across normal close/reopen. Prevent dismissal during AI checking, unresolved creation and active upload/recovery operations. Retain upload retry/recovery and existing navigation guard. Restore focus; ensure Escape never navigates underlying Request detail.
5. Update existing Intake stories and add contextual creation stories. Verify required validation, all three AI classifications, confirmation before saving, failures/retry, draft/file retention, focus, keyboard and desktop/mobile layout. Run focused unit/browser tests, typecheck, lint and production build. Show the actual app and Storybook previews.

## Source and limits

- ReUI: https://reui.io/preview/base/components/c-dialog-1?ref=mcp
- Dialog API: https://ui.shadcn.com/docs/components/base/dialog
- Linear behavior: https://linear.app/docs/creating-issues
- Plane interaction reference: `.next-audit/plane-navigation/quick-actions.tsx`.
- No new routes, tables, permissions or AI endpoints. Same existing one-check/confirm-save contract. No priority, assignee or team selectors added.
- Browser-session text recovery remains person/workspace-scoped. File selection survives modal close/reopen in the active app session; a full reload still requires selecting files again.
- This is a local implementation and review; no production deployment or commit is part of this increment.

## Verification — 2026-10-05

- Production Next build passed; TypeScript and scoped ESLint passed after implementation. Logs: `.next-audit/request-composer-build.log`, `request-composer-final-typecheck.log`, `request-composer-final-lint.log`.
- All 40 Intake/composer browser scenarios passed at 1440px light and 390px dark. Coverage includes required fields, direct review, classifications and confirmed save, close/reopen text and files, focus, contextual keyboard behavior, busy dismissal protection, upload retry and idle recovery. Logs: `.next-audit/request-composer-browser-desktop.log` and `request-composer-browser-phone.log`.
- 41 isolated draft/token/attachment safety tests passed. The separate 25-test draft/recovery/gate-contract run also passed; these runs overlap and are not 66 unique tests. Logs: `.next-audit/request-composer-safety-unit.log` and `request-composer-unit.log`.
- The broader existing UI source-contract suite has eight failures in untouched auth/settings expectations (old imports, field geometry and role markup). They are outside this increment; that suite is not reported as passing. Log: `.next-audit/request-composer-ui-unit.log`.
- Verified in the signed-in local app: New Request opens above Requests without changing `/`, with initial title focus and full-screen layout at the narrow preview width. No live AI submission, database creation or attachment upload was performed for this verification. Storybook tests mock those external boundaries.
- Storybook's Vite Next Link alias was preventing default before the consumer handler. Using the framework's exported `link.mock` restores the actual Next Link event order; production link cancellation and modified-click safeguards remain intact.
- Inspected desktop/light and phone/dark compose and AI-review captures in `test-results/request-composer/{desktop,phone}-{open,review}.png`: one dialog surface, contained content, visible actions, and clear focus. The actual app was also visually checked at desktop width with supporting details expanded. Storybook's final alias ordering fix passed a fresh focused Open interaction check and the interactive preview opens correctly.
