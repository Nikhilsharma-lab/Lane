# Screen walk bug log (2026-10-26)

Output of **[Walk every screen and popup and log what's broken](https://github.com/Nikhilsharma-lab/Lane/issues/228)**, on the map
**[Lane UI polish, bugs and speed](https://github.com/Nikhilsharma-lab/Lane/issues/223)**. Nothing was fixed. This branch is a
record and is never merged.

**How it was walked:** `main` at `3e6de934`, signed in, against a local database seeded with three throwaway workspaces:
a full one (31 Requests, 3 people, Projects, labels, comments, Inbox items, and six Requests later closed with results), an
empty one, and a brand-new one whose first run wasn't finished. Followed `docs/agents/local-browser-checks.md`. Every
screen and popup was checked at 1440 / 1024 / 768 / 390, in light and dark, empty / full / long-content / loading / offline,
and by keyboard. Contrast was checked with axe plus eyes. It was the dev server, so **speed was not judged here**. Settings → Slack was skipped (out of scope).

**Totals: 194 findings. 23 broken, 56 inconsistent, 115 rough. 139 are a fix, 55 need a decision.**

| Area | Log | Findings | Broken | Inconsistent | Rough | Fix | Needs a decision |
|---|---|---|---|---|---|---|---|
| App frame, sidebar, ⌘K, shortcuts, toasts, error screens | [A1](A1-app-frame.md) | 27 | 4 | 7 | 16 | 18 | 9 |
| Requests list, search, empty states, first run | [A2](A2-requests-list-search.md) | 35 | 3 | 10 | 22 | 23 | 12 |
| Request detail and its popups | [B](B-request-detail.md) | 37 | 4 | 10 | 23 | 23 | 14 |
| New Request composer, Intake, Inbox, Impact | [C](C-filing-inbox-impact.md) | 34 | 6 | 11 | 17 | 29 | 5 |
| Closing with a result, and Impact with results | [C2](C2-impact-with-results.md) | 20 | 2 | 5 | 13 | 16 | 4 |
| Settings, sign-in / sign-up, onboarding, Privacy, Terms | [D](D-settings-sign-in.md) | 37 | 4 | 11 | 22 | 27 | 10 |
| Guest submission: Take this on | [Z](Z-guest-take-on.md) | 4 | 0 | 2 | 2 | 3 | 1 |

Each area log has what was covered, every finding with its screenshot, hard-to-read text, and the
`docs/design-system/page-quality.md` items it re-checked. Screenshots are in [`shots/`](shots/), one folder per area,
named `<screen>-<state>-<width>-<theme>`.

**Severity.** *Broken* means it doesn't work, loses data, can't be reached or can't be read. *Inconsistent* means it differs from the same
thing elsewhere in Lane. *Rough* means it works but feels unfinished. **Tag.** *Fix* means there's an obvious right answer. *Needs a decision* means
it changes behaviour or meaning.

## Problems that show up everywhere

These patterns account for many single findings. Fixing each once, at its root, clears the whole group.

1. **Offline sends you out of Lane.** A failed save or a page move while offline replaces the app with the browser's
   "No internet" page, and the work in hand is lost. It happens from the list (A21), Settings → Role (D3), Inbox and Impact (C6),
   the sidebar (A127) and links on a Request (B28). Switching workspace offline freezes the app instead (A111). Create Request offline
   hides its error below the fold (C1). New Project offline shows the raw "Failed to fetch" (A18). One cause for saves: a
   failed optimistic save calls `router.refresh()` (`use-optimistic-action.ts`). **Decision:** how much offline handling Lane should
   have (stay put and say "You're offline", vs accept the browser page when moving between pages).
2. **Everyone has two names.** The Journey, reviewer picker, Inbox "Needs you", close notes and Settings use the sign-in (Clerk)
   name. Everything else uses the name saved in Lane. Daniel can't be found in the reviewer picker under his Lane name
   (B6, C8, D5, Z). **Decision:** which name is the one name, and whether renaming in one place updates the other.
3. **Dates and times disagree.** Journey dates are in UTC, so the day can differ from Submitted (B5). Inbox dates change day after loading
   (C15). There are at least four formats for one date ("10/1/2026", "1 Oct 2026", "Sep 6 – 10, 2026", "2026-09-06") (B7, C9, C10). **Fix:** one
   date format and the viewer's time zone everywhere.
4. **Focus goes missing.** After saving a view, after closing confirmations, after going Back, and after opening forms inside the Journey,
   keyboard focus drops to the page body (A26, A211, A232, B3, B4, C22, C2-3, A210). In the Journey that turns Escape into
   "leave the page and lose what you typed" (B2, C2-1). Confirmations open on the × rather than the safe button (B31, C2-13).
   **Fix:** one rule. Focus moves into whatever opens, and back to whatever opened it.
5. **Things change without saying so.** Limits cut text silently (C3: a paste lost 7,000 characters; A110, A222). An edit wipes other
   fields and review answers (B8, B9). Permanent closes have no warning (B11, C2-9). Copy succeeds with no visible sign (A14). Duplicate
   Project names silently open the existing one (A19).
6. **The page under the page.** Clicking outside a menu also clicks what's under it (A16). Tapping beside the phone navigation
   acts on the content (A15). The recent-searches menu lets the cards behind show through (A23). Chips overlap in list rows at
   768 / 1024 (A22).
7. **Wrong loading skeleton.** Opening a Request, Inbox or Impact first shows the Requests list skeleton, then jumps (A115, C14).
   Settings and the list skeletons don't match their pages (A225, D22). Request detail shows "Loading journey…" text instead (B27).
8. **Cut-off text with no way to read it.** No "…" or tooltip on long names and descriptions: the sidebar account name (A112, A233), the metric pickers
   (B24, C18), Inbox rows (C27), view names (A235), the invite email field (D26), the one-line title field on phone (C19, Z1).
9. **Touch targets too small on phones** (A27, B29, C12, C24, C27): 24–30px where Lane's own touch size is 44px.
10. **Clerk screens look off-brand.** Create-workspace overflows on phones (D2). Clerk's manage windows are squashed (D4). Clerk's default wording
    ("Setup your organization", "Welcome back!") appears (D6, D14). Fields are near-invisible in dark (D15). Error styles differ (D11, D16). All of this is to be
    fixed within Clerk's styling options only.
11. **Impact can't show its results.** The chart has no values, axis, labels or tooltips (C2-2). Nothing says whether a target was met
    (C2-5). "Predicted" means two things (C2-6). A pass/fail result has three wordings (C2-7).

## Broken (23)

- **A11** [Command palette during a page change](A1-app-frame.md): pressing ⌘K while a page is loading opens the palette, then closes it, losing what you typed. This is the likely cause of the hosted e2e "input lost focus" failure, which never reproduced in ~50 normal opens.
- **A15** [Phone / 768 navigation](A1-app-frame.md): tapping beside the open navigation panel also acts on what's underneath (4 of 4 tries opened something).
- **A17** [Sidebar "New Project" with keyboard focus](A1-app-frame.md): its label is drawn twice ("NeNew Project").
- **A111** [Switch workspace offline](A1-app-frame.md): the app freezes on "Switching workspace…" until a reload.
- **A21** [Requests list, change a Request offline](A2-requests-list-search.md): the tab leaves Lane for the browser's "No internet" page.
- **A22** [Requests list rows at 768 and 1024](A2-requests-list-search.md): the Project chip overlaps the labels "+1" chip ("+1Mobile app — Androi").
- **A23** [Recent-searches menu](A2-requests-list-search.md): with 3+ recent searches, the cards behind paint through the menu.
- **B1** [Request page Journey](B-request-detail.md): after Pick up, Mark Done or Close without a result it shows the old step until a full reload.
- **B2** [Journey forms](B-request-detail.md): Escape leaves the Request and throws away a half-filled form.
- **B5** [Journey dates](B-request-detail.md): shown in UTC, so the day can disagree with Submitted.
- **B8** [Edit Request](B-request-detail.md): changing only the title wiped the Problem and Suggested change text (needs a decision on what an edit may change).
- **C1** [Create Request offline](C-filing-inbox-impact.md): looks like nothing happens; the error sits out of view.
- **C2** [Composer measurement window](C-filing-inbox-impact.md): custom dates can be in the past.
- **C3** [Composer title and description](C-filing-inbox-impact.md): text over the limits is dropped silently (a 12,000-character paste lost 7,000).
- **C4** [Impact, click a teammate](C-filing-inbox-impact.md): their list renders ~1,200px further down while the page jumps to the top.
- **C5** [Inbox on phone](C-filing-inbox-impact.md): an opened item still shows unread after Back, until a reload.
- **C6** [Inbox / Impact offline](C-filing-inbox-impact.md): moving there, or switching Month / Quarter / Year, shows the browser's "No internet" page.
- **C2-1** [Close Request form](C2-impact-with-results.md): Escape goes back to the list and the typed result is lost.
- **C2-2** [Impact metric chart](C2-impact-with-results.md): it can't be read. There are no values, axis, Request labels or tooltips.
- **D1** [Signed in but no workspace yet](D-settings-sign-in.md): any app page lands on "Page not found" at `/login/tasks`, and its button loops back there.
- **D2** [Create workspace on phone](D-settings-sign-in.md): the page scrolls sideways and its title, field and Continue are cut off.
- **D3** [Settings → Profile → Role offline](D-settings-sign-in.md): the browser's "No internet" page replaces the app, and the choice is lost.
- **D4** [Clerk "Manage workspace" / "Manage members"](D-settings-sign-in.md): the content is squeezed into a narrow column, so removing a member can't really be done.

## Needs a decision (55)

The product choice is in each item; the area log has the detail.

- **A14** [Command palette → "Copy link" / "Copy code" on a Request](A1-app-frame.md) (inconsistent): should a copy from the palette show a visible "Link copied" (toast or similar)?
- **A19** [New Project with an existing name](A1-app-frame.md) (rough): say "Checkout already exists, opened it", or block with an error?
- **A110** [New Project name length](A1-app-frame.md) (rough): is 80 the right limit? Either way, show it once you get close.
- **A113** [Account menu for a Member](A1-app-frame.md) (inconsistent): give Members a different label (e.g. "Members"), or hide the item from them?
- **A118** [Page not found (`/nope`, `/settings/nope`)](A1-app-frame.md) (inconsistent): should a signed-in 404 keep the sidebar? Should it carry the Lane mark?
- **A119** [Page not found, signed out](A1-app-frame.md) (rough): different wording when signed out, e.g. "Go to Lane" or "Sign in"?
- **A122** [Reduced motion](A1-app-frame.md) (inconsistent): is a short fade acceptable under reduced motion? If not, remove it everywhere; if so, the palette is the odd one out.
- **A123** [Keyboard shortcuts dialog: how to open it](A1-app-frame.md) (rough): add it to the account menu next to "First-run guide"?
- **A127** [Sidebar link clicked offline](A1-app-frame.md) (rough): how much offline handling should the frame have (stay on the page and show a message)?
- **A212** [Requests list, paging across status groups (known open item)](A2-requests-list-search.md) (inconsistent): Page 1 of All shows "In progress: 9 of 10 Requests".
- **A213** [Requests list, Done rows](A2-requests-list-search.md) (inconsistent): Done rows show no priority glyph at all, while Open and In progress rows show "···" for "No priority".
- **A214** [Requests list → title filter (magnifier in the list toolbar) vs. workspace search (magnifier in the sidebar)](A2-requests-list-search.md) (inconsistent): Two magnifier buttons do different things: one filters this list by title (its popover is titled "Search Requests"), the other searches the workspace.
- **A215** [Requests list → status pill, Project page](A2-requests-list-search.md) (rough): Choosing a pill also adds a "Status · Done" chip plus a "N Requests match / Clear all" bar, saying the same thing twice.
- **A216** [Request preview panel (Space) and list summary panel](A2-requests-list-search.md) (rough): Both panels lie over the list instead of narrowing it.
- **A218** [First-run guide step 3, "Invite teammates"](A2-requests-list-search.md) (rough): Two wording problems.
- **A219** [First-run guide step 2](A2-requests-list-search.md) (rough): "Work with nothing to measure can say why instead." is hard to parse.
- **A220** [First-run guide, Back then leave](A2-requests-list-search.md) (rough): After going Back from step 5 to step 1 and reloading, the guide reopens at step 5 (the furthest step reached, not the one you left on).
- **A221** [Requests list with one or few Requests (after the first Request; Project pages)](A2-requests-list-search.md) (rough): Every status group is listed even when empty: one Request sits above four "0 Requests" bars (In progress, Done, Measuring, Closed) that fill the screen.
- **A223** [Delete view confirmation](A2-requests-list-search.md) (rough): "The view leaves your navigation." is awkward.
- **A224** [Status pills with nothing in them (Measuring, Closed, Due soon or overdue)](A2-requests-list-search.md) (rough): The empty state says "No matching Requests.
- **A228** [Row menu → Status submenu](A2-requests-list-search.md) (rough): Done, Measuring and Closed are greyed out with no reason given: show the reason (e.g. "Pick it up first"), or hide them?
- **B6** [Journey, reviewer picker, close notes](B-request-detail.md) (inconsistent): People appear under two different names on the same page.
- **B8** [Edit Request → save](B-request-detail.md) (broken): Changing only the title on LAN-34 also wiped the "Problem" text and "Suggested change" shown above the plan.
- **B9** [Edit Request → save with an open concern](B-request-detail.md) (rough): Saving an edit silently clears every review answer (Daniel's concern vanished and he shows "Waiting" again).
- **B10** [Iterations of this problem → Remove](B-request-detail.md) (rough): Remove takes a Request out of the Same problem group at once: no confirmation, no Undo, only a small inline note.
- **B11** [Close without a result](B-request-detail.md) (rough): It can't be undone ("Closed Requests never reopen"), yet there is no confirmation step.
- **B17** ["Is it live?" and release copy](B-request-detail.md) (rough): "Recording the release ends Undo Done for this Request." uses internal jargon ("Undo Done", "exposure", "(UTC)").
- **B21** [Description, comments, release evidence](B-request-detail.md) (rough): Web addresses are plain text, not clickable (LAN-30's description, the comment link, "Evidence: https://…").
- **B22** [Long Request (LAN-30)](B-request-detail.md) (rough): A 12-paragraph description pushes the Journey and Conversation about 1,700px down, and there is no "Show more".
- **B23** [Reviewer row after raising a concern](B-request-detail.md) (rough): After raising a concern, the button to change it still says "Raise a concern": relabel it (e.g. "Edit concern")?
- **B28** [Offline → clicking a link on the page (e.g. an iteration)](B-request-detail.md) (rough): You land on the browser's own "No internet" page and leave Lane.
- **B32** [Undo Done](B-request-detail.md) (rough): Undo is only in the toast.
- **B33** [Properties → Priority](B-request-detail.md) (inconsistent): Even for an Admin who is the Requester, priority can only be changed while the Request is Open.
- **B35** [Comments](B-request-detail.md) (rough): Comments can't be edited or deleted, and can't take attachments.
- **B36** [Journey → Measuring step](B-request-detail.md) (rough): Five same-weight buttons in a row.
- **C6** [Inbox / Impact while offline](C-filing-inbox-impact.md) (broken): show Lane's own offline notice and stay on the current page, or accept the browser page for navigation
- **C7** [Requests list after filing (and Copy title)](C-filing-inbox-impact.md) (inconsistent): which one name a Request goes by in lists, and whether the review step should say so
- **C23** [`/intake` launcher](C-filing-inbox-impact.md) (rough): label the launcher "New Request"
- **C28** [Inbox → delivery settings](C-filing-inbox-impact.md) (rough): add a "Delivery settings" link in the Inbox strip
- **C34** [Impact, empty (`empty`)](C-filing-inbox-impact.md) (rough): wording (e.g. "Requests you file or pick up show here") and whether to add New Request
- **C2-5** [Closed step, Outcome report, My work](C2-impact-with-results.md) (inconsistent): show "Met target" / "Below target" beside each result, or keep results deliberately neutral
- **C2-9** [Close Request and Close without a result… forms](C2-impact-with-results.md) (rough): add the warning line inside both forms, or a confirm step
- **C2-10** [Record release dialog → Actual exposure date](C2-impact-with-results.md) (inconsistent): should a release be allowed to predate the pickup (work shipped another way), or should the earliest date be the pickup day?
- **C2-20** [Impact → My work and teammate lists with closed results](C2-impact-with-results.md) (rough): order (recent results first?) and whether My work shows What we learned
- **D5** [Settings → Profile and Members, compared with the rest of Lane](D-settings-sign-in.md) (inconsistent): Settings shows the Clerk account name ("Review PM", "Review Designer", "Lane E2E").
- **D7** [Onboarding → create workspace](D-settings-sign-in.md) (rough): The workspace name and logo are filled in from the email's domain.
- **D11** [`/login`, `/signup`, `/forgot-password`: empty submit or bad email format](D-settings-sign-in.md) (inconsistent): Clerk shows the browser's own tooltip ("Please fill out this field.") for empty or badly formed emails instead of an inline message: switch it to Lane-style inline errors within Clerk's options, or accept it?
- **D13** [`/login` and `/forgot-password`](D-settings-sign-in.md) (rough): "Couldn't find your account." tells anyone whether an email address has a Lane account.
- **D17** [`/terms` (and `/privacy`) compared with the app](D-settings-sign-in.md) (rough): Terms say "Lane is free during the pilot and does not accept payment" and name only administrators, members and guests.
- **D18** [`/privacy`](D-settings-sign-in.md) (rough): Still no link back to the Terms of service (Terms links to Privacy).
- **D24** [Settings → Coming soon](D-settings-sign-in.md) (rough): Each "Coming soon" label is a disabled button at 50% opacity.
- **D25** [Settings → Coming soon → Requests → "Labels"](D-settings-sign-in.md) (inconsistent): Request labels are listed as "Coming soon", but Requests already carry labels in Lane.
- **D28** [Settings → Members → Invite, role note](D-settings-sign-in.md) (rough): "Guest and Viewer aren't available in this workspace yet." sits right under "Guests and Viewers are free.", which reads as a contradiction to an Admin.
- **D31** [Settings, how saves are confirmed](D-settings-sign-in.md) (inconsistent): Each control confirms differently: Role shows a toast, Inbox delivery shows text in the card footer ("Saved.
- **Z2** [Request detail → Guest submission, after Take this on](Z-guest-take-on.md) (inconsistent): should Pick up wait until the prediction is written, or should the text stop implying it must?

## Hard-to-read text

| Where | Text | Theme | Contrast |
|---|---|---|---|
| Requests list rows and Request detail, Guest submission badge (9px) | "Waiting to be taken on" | light | **2.66:1** (#dc7b18 on #f7eee6), needs 4.5:1. Dark passes. |
| New Request composer, validation errors (12px) | "Choose a metric", "Description is required", "Title is required" | dark | **3.35:1** (#b54a46 on #181a19) |
| Add reviewer → invite hint link | "Invite them as a Member" is told apart from its sentence only by colour, with no underline | both | link vs text 1.84:1 light, 1.07:1 dark (needs 3:1 or an underline) |
| Sign-in, sign-up, create workspace (Clerk) | Field edges and the "Continue with Google" outline | dark | field border ≈1% white on near-black; button outline at 7–11% opacity |
| Settings → Coming soon | "Coming soon" labels (disabled buttons at 50% opacity) | both | visibly faint; axe skips disabled controls |
| Label chips, Project chips, Impact and Iterations status pills | 9px text | both | passes contrast; very small (9px badges were a decided style, so this is flagged for your judgement only) |

The rest passed axe colour contrast in both themes: the frame, every overlay, Settings, Inbox and Impact. The Impact chart legend in dark is about 6:1.

## Not walked

- **Speed:** dev server only. It needs measuring on the production build and the live site.
- **Roles:** Guest and Viewer roles (the Clerk development instance doesn't define them).
- **Clerk:** removing a member (it only exists inside the broken Clerk window, D4).
- **Clerk:** a real password reset (needs an emailed code). Sign-up was not completed (the Clerk instance is at its user limit).
- **Error screens:** the four error boundaries can't be triggered by URL, so they were reviewed from code.
- **Devices:** VoiceOver and a real phone's on-screen keyboard. These were approximated with axe and a 390×500 viewport.
- **Possibly dev-only:** two chunk 404s in the console (A234, D37) and the Inbox / Impact list-skeleton flash (C14). Re-check on a production build.

## Nikhil's own bugs

None added on the ticket as of 2026-10-26. Add them as comments on the ticket; they join this log when bugs are triaged.
