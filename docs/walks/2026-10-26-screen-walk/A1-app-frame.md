# A1: App frame, sidebar and global overlays

## Covered

- **Who:** `pm` (Admin) in "Northwind Walk 228" for most of the walk. `dev` (Member) for the account menu, the Switch workspace submenu and "Invite and manage members". `empty` and `fresh` for the sidebar's no-Projects state. Signed out for the not-found pages.
- **Sizes and themes:** 1440 light and dark, 1024 light, 768 light and dark, 390 light and dark. `overflow()` was 0 on every frame page I visited: list, Inbox, Impact, Request detail, Settings, the 404 page and the "Request can't be opened" page. axe raised nothing on the frame or the overlays in either theme. The one axe hit is in the list rows (see Hard-to-read text).
- **Frame and sidebar:**
  - Skip link: visible on Tab, and Enter moves focus to the content.
  - Account menu: mouse, keyboard, Escape, clicking outside, the Switch workspace submenu with arrow keys, and the phone bottom sheet.
  - Search and New Request icons: tooltips on hover and on keyboard focus.
  - Nav: All Requests, Impact and Inbox.
  - Projects fold: click, plus the arrow, Home and End keys.
  - Project right-click menu: mouse, arrow keys, Shift+F10, Copy link with and without clipboard permission. Right-clicking the coloured dot opens the same menu. The row "glyph menu" belongs to the list, not the frame.
  - New Project inline composer: empty name, Escape, clicking outside, a duplicate name, an 85-character name, offline, and a real create. I created three Projects: `[A1] Walk project light 543`, `[A1] Quarterly-planning-…` (cut to 80 characters) and `[A1] P light`.
  - No Project.
  - `[` to collapse and expand, and the hover peek.
  - Breadcrumbs on Inbox, Impact, Request detail and the unavailable Request.
- **Phone (390) and 768 navigation:** both sizes use the peek panel, not a drawer. I tested open, Escape, tapping a link, the account sheet, and tapping beside the panel on 4 different targets.
- **Command palette:**
  - Opened about 60 times with both ⌘K and Ctrl+K. Places tested: list, detail, Inbox, Impact and Settings, at 1440 light, 390 dark, and with reduced motion. Timings tested: straight after page load, straight after the page becomes interactive, after a full load, after a client navigation, and during a page change.
  - Also tested: typing, arrow keys, Enter (in place and navigating), Escape, a second ⌘K, clicking outside, focus return, no matches, the Request entries on detail, and the Keyboard shortcuts / Search entries.
- **Keyboard shortcuts dialog (`?`):** content, opening with `?`, closing with `?` and Escape, focus return, and scrolling on phone and at 1024.
- **Toasts:** the "Could not copy" error toast at 1440 light and 390 dark, and Alt+T to reach it. I could not make the palette's "Could not open the command palette" toast appear: blocking the palette code while offline broke the whole dev page.
- **Offline:** creating a New Project, clicking a sidebar link, and Switch workspace.
- **Loading:** throttled client navigation to Request detail, and opening the preview under throttling.
- **Reduced motion:** frame-by-frame sampling of these at 1440 and 390:
  - collapse, expand and peek
  - palette open and close
  - account menu
  - Projects fold
  - right-click menu
  - tooltip
  - nav highlight
  - `?` dialog
  - phone account sheet
- **Not-found pages, seen live:** `/nope`, `/settings/nope`, `/requests/00000000-0000-0000-0000-000000000000`, `/requests/abc` and `/requests/30`, signed in (1440 light) and signed out (390 dark). Signed out, the Request URLs go to sign-in.
- **Error boundaries, reviewed from code only (none can be triggered by URL):**
  - `src/app/error.tsx`
  - `src/app/(app)/error.tsx`
  - `src/app/(auth)/error.tsx`
  - `src/app/global-error.tsx`
- **Not walked:** the Settings → Profile theme switch belongs to another group. The real phone on-screen keyboard over the palette can't be emulated.
- **Seen in passing, belongs to other groups:**
  - Every load of `/settings/profile` logs a 404 for the dev chunk `src_components_settings_paid-seat-dialog_tsx_*.js`.
  - At 768 the list's "+1" label chip overlaps the Project chip ("+1Mobile app").

## Findings

| # | Where | What's wrong | Severity | Tag | Seen at | Screenshot |
|---|---|---|---|---|---|---|
| A11 | Command palette (⌘K) during a page change | If you click a link and press ⌘K before the new page arrives, the palette opens and then closes itself when the page lands. Anything typed is lost. For a moment the palette is on screen but its field no longer has focus. This is the most likely cause of the hosted e2e failure ("dialog opened but its input did not retain focus"). In steady state I could **not** reproduce that failure: focus stayed in the field in all ~50 normal opens (list, detail, Settings; 1440 and 390; light and dark; reduced motion; ⌘K and Ctrl+K). Pointer: `command-palette-lazy.tsx` closes on any `pathname` change, including one that began before the palette opened. | broken | fix | 1440 light. 3 of 3 tries with Impact, Inbox and All Requests | none (timing only) |
| A12 | Command palette, first ⌘K after a page load | Until the page becomes interactive, ⌘K does nothing at all (up to about 8 s in dev). After that, the first ⌘K on each page loads the palette's code on demand, and letters typed meanwhile are dropped. Typing "inbox" straight after ⌘K left the field empty; "closed" left "sed". | rough | fix | 1440 light | [palette-typeahead-list-type-inbox-1440-light](shots/A1/palette-typeahead-list-type-inbox-1440-light.webp) |
| A13 | Command palette entries | There is no "Impact" entry. Typing "impact" gives "No matches", even though Impact is one of the three main places in the sidebar. Inbox and every Settings section are listed. | inconsistent | fix | all | [palette-nomatch-1440-light](shots/A1/palette-nomatch-1440-light.webp) |
| A14 | Command palette → "Copy link" / "Copy code" on a Request | A successful copy shows nothing on screen: it is announced only to screen readers. The Project right-click menu's Copy link changes to "Link copied", so sighted people get feedback there but not here. | inconsistent | needs a decision: should a copy from the palette show a visible "Link copied" (toast or similar)? | 1440 light | [toast-copy-link-1440-light](shots/A1/toast-copy-link-1440-light.webp) |
| A15 | Phone / 768 navigation peek | **Confirmed.** Tapping beside the open navigation panel closes it **and** acts on whatever is under your finger. Four tries, four hits: it opened the row's Assignee picker, the Add filter menu, the New Request composer, and a Request. Pointer: `sidebar-view.tsx` `onPointerDownCapture` only dismisses the peek; nothing swallows the tap. | broken | fix | 390 light/dark, 768 light | [m-tapthrough-row-title-text-390-light](shots/A1/m-tapthrough-row-title-text-390-light.webp), [m-tapthrough-row-assignee-button-390-light](shots/A1/m-tapthrough-row-assignee-button-390-light.webp) |
| A16 | Account menu and Project right-click menu | Clicking outside the menu to close it also clicks what is underneath. Here it opened a Request preview. Dialogs (palette, `?`) swallow that click. | inconsistent | fix | 1440 light | [account-menu-outside-click-1440-light](shots/A1/account-menu-outside-click-1440-light.webp) |
| A17 | Sidebar → "New Project" with keyboard focus | When the button has keyboard focus, its label is drawn twice, slightly offset ("NeNew Project"). This happens before and after creating a Project. Pointer: `workspace-sidebar.module.css` line 101 gives `.composerTrigger:focus-visible` `color: var(--foreground)`, so the button's normally invisible text shows on top of the visible label. | broken | fix | 1440 light | [combo4](shots/A1/combo4.webp), [np-focus-before-light](shots/A1/np-focus-before-light.webp) |
| A18 | New Project, offline | The error under the field reads the raw browser text "Failed to fetch". | rough | fix | 1440 light | [newproject-offline-1440-light](shots/A1/newproject-offline-1440-light.webp) |
| A19 | New Project with an existing name | Entering "Checkout" (already a Project) creates nothing and silently opens the existing Checkout Project. No message says it already exists. | rough | needs a decision: say "Checkout already exists, opened it", or block with an error? | 1440 light | [newproject-dup-1440-light](shots/A1/newproject-dup-1440-light.webp) |
| A110 | New Project name length | The field silently stops at 80 characters. There is no counter or message, so a longer name is cut mid-word. | rough | needs a decision: is 80 the right limit? Either way, show it once you get close. | 1440 light | [newproject-long-typing-1440-light](shots/A1/newproject-long-typing-1440-light.webp) |
| A111 | Account menu → Switch workspace, offline | The switch hangs for good. The spinner and "Switching workspace…" stay, and the whole app is frozen (sidebar and content can't be used). It did not recover within 8 s of going back online. Only a reload gets you out. Pointer: `use-workspace-switcher.ts` needs a failure or timeout path. | broken | fix | 1440 light | [offline-switch-recovered-1440-light](shots/A1/offline-switch-recovered-1440-light.webp) |
| A112 | Sidebar account button | The person's name is cut to a few letters even when there is room: "Priy…" (Priya Raman), "Dan…" (Daniel Okafor) and "Sa…" (Sam Empty) at 1440, and "P…" at 768. The search and compose icons take the rest of the row. | rough | fix | 1440, 1024, 768 | [home-1440-light](shots/A1/home-1440-light.webp), [frame-empty-1440-light](shots/A1/frame-empty-1440-light.webp) |
| A113 | Account menu for a Member | A Member sees "Invite and manage members". The page it opens says "Only Admins invite people or change roles." | inconsistent | needs a decision: give Members a different label (e.g. "Members"), or hide the item from them? | 1440 dark (dev) | [account-menu-dev-1440-dark](shots/A1/account-menu-dev-1440-dark.webp) |
| A114 | Browser tab title, every page | Every tab reads just "Lane": list, Inbox, Impact, a Request, Settings, New Request, the 404 and sign-in. With several Lane tabs open you can't tell them apart, and screen readers announce nothing useful on page change. Pointer: `src/app/layout.tsx` is the only metadata title. | rough | fix | all | none |
| A115 | Opening a Request from Inbox or Impact (loading) | While loading you see the **Requests list** skeleton, with a "Requests / ▭" trail and a "New Request" button. That then jumps to the two-column detail with a "Checkout / LAN-1" trail and Edit / Delete / Pick up buttons. Pointer: `(app)/loading.tsx` catches the change instead of `requests/[id]/loading.tsx`. This covers and extends page-quality's P3 "detail skeleton's trail differs". | rough | fix | 1440 light, throttled | [combo10](shots/A1/combo10.webp) |
| A116 | Request preview while loading | On a slow connection the preview pane first shows only the bare text "Close preview" in the middle of an empty pane, before its skeleton appears. It looks like an unstyled button. Shared with the list/preview group. | rough | fix | 1440 light, throttled | [loading-detail-300-1440-light](shots/A1/loading-detail-300-1440-light.webp) |
| A117 | Unknown Request (`/requests/abc`, `/requests/000…`) | The "This Request can't be opened" screen itself is fine and keeps the frame, but the server answers 200 instead of 404. | rough | fix | 1440 light, 390 dark | [err-abc-in-1440-light](shots/A1/err-abc-in-1440-light.webp) |
| A118 | Page not found (`/nope`, `/settings/nope`) | This screen drops the whole app even when you're signed in: no sidebar and no Lane mark, just a "Page not found" strip and a centred message. The unknown-Request screen keeps the full frame. It also repeats its heading ("Page not found" then "This page doesn't exist"). | inconsistent | needs a decision: should a signed-in 404 keep the sidebar? Should it carry the Lane mark? | 1440 light, 390 dark | [err-nope-in-1440-light](shots/A1/err-nope-in-1440-light.webp), [err-nope-out-390-dark](shots/A1/err-nope-out-390-dark.webp) |
| A119 | Page not found, signed out | The message says "go back to your Requests" and the button "Go to Requests", but a signed-out visitor has no Requests and the button leads to sign-in. | rough | needs a decision: different wording when signed out, e.g. "Go to Lane" or "Sign in"? | 390 dark | [err-nope-out-390-dark](shots/A1/err-nope-out-390-dark.webp) |
| A120 | Error screen inside the app (`src/app/(app)/error.tsx`), code only | It is the only error screen without the "If this keeps happening, email uselaneapp@gmail.com" line. The root, sign-in and last-resort screens all have it. It also doesn't report the error (no `reportClientError`). `(auth)/error.tsx` doesn't report it either. | inconsistent | fix | code | none |
| A121 | Root error screen (`src/app/error.tsx`), code only | It says "Database unavailable" / "Lane can't reach its database right now" for **any** failure in the app frame, not only database outages. | rough | fix (neutral wording, e.g. "Lane can't load your workspace right now") | code | none |
| A122 | Reduced motion | The palette opens and closes instantly, but these still fade in and out over about 200 ms: the `?` dialog, the account menu, the Project right-click menu and the phone account sheet. Sidebar collapse, peek, Projects fold, nav highlight and tooltips are instant. | inconsistent | needs a decision: is a short fade acceptable under reduced motion? If not, remove it everywhere; if so, the palette is the odd one out. | 1440, 390 | none (frame sampling) |
| A123 | Keyboard shortcuts dialog: how to open it | No button or menu item opens it. The palette's "Keyboard shortcuts" entry needs a keyboard too, so mouse-only and touch users can't find it. Known P3, still present. | rough | needs a decision: add it to the account menu next to "First-run guide"? | all | none |
| A124 | Keyboard shortcuts dialog on phone | The whole dialog scrolls, so the title and close (×) button scroll out of view with the list. | rough | fix | 390 light | [shortcuts-scrolled-390-light](shots/A1/shortcuts-scrolled-390-light.webp) |
| A125 | Keyboard shortcuts dialog spacing | Labels that wrap to two lines ("Expand a group, then go to its first Request" / "Collapse a group…") sit with no gap between rows, while one-line rows are evenly spaced. | rough | fix | 1440, 1024, 390 | [shortcuts-1440-light](shots/A1/shortcuts-1440-light.webp) |
| A126 | Breadcrumb on Request detail at 1024 | The short workspace name is cut ("Northwind Walk …") while the long Project name keeps most of the width. | rough | fix | 1024 light | [frame-detail-1024-light](shots/A1/frame-detail-1024-light.webp) |
| A127 | Sidebar link clicked offline | You land on the browser's own "No internet" page and leave Lane entirely. No in-app message appears. | rough | needs a decision: how much offline handling should the frame have (stay on the page and show a message)? | 1440 light | [offline-nav-impact-1440-light](shots/A1/offline-nav-impact-1440-light.webp) |

## Hard-to-read text

| Where | Text | Theme | Measured contrast (if axe gave it) |
|---|---|---|---|
| Requests list rows, "Waiting to be taken on" badge (`.badge-module__…__text`, 9 px). Not frame, but it is flagged on every list page. | "Waiting to be taken on" | light (dark passes) | 2.66:1 (#dc7b18 on #f7eee6); needs 4.5:1 |

Every frame surface and overlay passed axe color-contrast in both themes: sidebar, account menu, palette, right-click menu, `?` dialog, toasts and the 404 page.

## page-quality.md items re-checked (row "2.0 App frame and states")

- **P2, the root error says "can't reach its database" for any `(app)` layout throw:** still present (code), A121.
- **P2, `(app)/error.tsx` and `(auth)/error.tsx` don't call `reportClientError`:** still present in both (code), A120.
- **"Let us know" contact path, built 2026-10-21:** present in the root, `(auth)` and global error screens. **Missing from `(app)/error.tsx`** (A120).
- **P2, a tap beside the phone navigation peek may fall through to the content (unverified):** **confirmed, still present.** Taps open pickers, menus, the composer or a Request (A15).
- **P3, the detail skeleton's trail differs from the loaded one:** still present. It is worse when arriving from Inbox or Impact, which shows the list skeleton (A115).
- **P3, the `?` overlay has no pointer entry (decision):** still present (A123).
- **P3, the root frames are unbranded and repeat their heading:** still present, seen live on the 404 page (A118). Error screens confirmed from code: strip "Database unavailable" plus title "Lane can't reach its database right now", and strip "Lane unavailable" plus "Lane can't load right now".
- **Fixed earlier, skeletons invisible in light theme:** gone. The skeleton bars are visible in light ([combo10](shots/A1/combo10.webp)).
- **Fixed earlier, the current crumb truncated before its ancestors:** gone. "LAN-30" stays whole at 1024 and on the 390 strip.
- **SESSION-STATE: hosted e2e palette input lost focus:** not reproduced in steady state. Reproduced when ⌘K is pressed during a page change (A11).
