# Requests with the pane open — November 3 polish

Scope: the production Requests composition, including the first-run slot, list,
in-flow Request preview, nested toolbar, header, sections and conversation. The
approved Lane palette and installed Arc components remain the visual authority.

## Findings and changes

| Finding | Resolution |
| --- | --- |
| The dismissed first-run guide left an empty padded wrapper. The divider began 16px below the page strip. | Collapse only an empty slot. The reopen listener stays mounted and a visible guide retains its spacing. Browser measurement: page-strip bottom and pane top both 57px. |
| The toolbar used window breakpoints; a 434px pane could lose its Request code. | Use the dock's inline-size container. Edit/Delete fold to labelled icons; copy actions move into the installed Arc menu on narrow panes. Close, saved code, open-full-page and lifecycle action remain visible. |
| Below the sidebar breakpoint, the nested strip reserved a nonexistent sidebar control. | An explicit null expand slot renders no placeholder. The main page still reserves its real control. Added PageStrip coverage. |
| A long title in a fixed header could consume the reading area on short screens. | Header and panels share one scroller beneath the fixed toolbar; skeleton uses the same layout. Verified 768×480 with a long title and independent pane scrolling. |
| Header/body insets differed from toolbar insets; unbroken names could overflow. | Shared token-based reading insets, constrained metadata/title wrapping and fixed icon shrink behavior. |
| Keyboard tab outlines could be clipped by the horizontal tab strip. | Draw the focus outline inside the trigger. Keep Radix Arrow/Home/End behavior and mounted inactive panels. |

## Design review

Applied Emil UI review/polish, surfaces, typography and line behavior, animation,
performance, touch/accessibility, forms, foundations and component-design guidance.
Repeated reading actions remain immediate. No width/height animation, added
effects, new palette, duplicated data loader, or new dependency. Arc remains the
component owner; the compact copy menu reuses the installed DropdownMenu and
existing clipboard announcement/failure handling.

## Verification boundary

Signed-in actual app on port 3234, using an isolated copy of the local database
and two dedicated visual Requests. No production data or Clerk memberships were
changed. This is not the old standalone preview that omitted the first-run wrapper.

- Dark: 1440×900, 1024×768 and 768×480. Light: desktop and phone fallback.
- Measured continuous divider, no document/body horizontal overflow, visible code
  and controls, independent short-screen scroll, long title wrapping, skeleton.
- Different row replaces the pane; same row closes it; Space opens it; Escape
  returns focus to its originating row. Escape from the copy menu closes only the menu.
- Keyboard section navigation and retained unsaved comment text across tab changes.
- UI suite: 1,040 tests passed; after the final shared-strip fix, its targeted
  suite plus Request first-render coverage passed 17 tests (including the new case).
- Design contract suite: 59 tests passed; token, Arc source and brand audits pass.
  Existing palette contrast warnings remain unchanged; no new design literals.
- Typecheck and changed TypeScript-file lint passed. Production build verified.

Existing error/unavailable rendering and posting/authorization paths are preserved.
No forced offline browser run, authenticated comment submission, or exhaustive
role/lifecycle journey is claimed by this visual pass. Those behaviors retain
their existing automated coverage; no database-reset suite was run.

Local evidence: `/private/tmp/lane-pane-polish-dark.png`,
`/private/tmp/lane-pane-polish-light.png`; build/test logs use the
`/private/tmp/lane-pane-` prefix. Release evidence is recorded separately.
