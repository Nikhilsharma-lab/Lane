# Request pane composition

Use this for the in-flow Request preview beside Requests or Inbox. Compose the
same Request detail components as the full page; never build a second visual mock.
For colour provenance, read [Lane tokens](lane-tokens.md); runtime
values and editing rules are in [the theme file](theme-file.md).

## Sources and responsibilities

| Reference | Reused structure | Lane responsibility |
| --- | --- | --- |
| [Arc page-header](https://uiarc.dev/components/blocks/page-header) | Title, metadata, controlled Radix tabs | Saved Request data; Overview, Journey, Activity and Conversation panels |
| [Arc timeline](https://uiarc.dev/components/timeline) | Grouped history, aligned markers and vertical connectors | Only saved lifecycle events; no invented activity |
| [Arc comment-thread](https://uiarc.dev/components/comment-thread) | Enclosing thread, unboxed comments, author/time row, inline composer | Existing permissions, optimistic posting, drafts and failure recovery |
| [Arc AI side panel](https://uiarc.dev/components/blocks/ai-side-panel) | Relative dock and independently scrolling columns | Request reading; no AI responder or demo controls |

These are explicit source adaptations, recorded in [the Arc ledger](arc-sources.md).
The AI reference is a layout source, not authorization to add AI features.

## Choose a section

```text
Saved context, Goal, files, design links or related Requests? → Overview
Lifecycle state, readiness, release or outcome action?         → Journey
When a saved lifecycle event happened?                        → Activity
Existing comments or the comment composer?                    → Conversation
```

`RequestPaneTabs` owns one selected section, initially `overview`. Each
`RequestPanePanel` takes `value` and `children`. It keeps inactive content mounted
and hidden so tab changes do not discard drafts. The full page bypasses these
wrappers and retains its continuous reading order.

```tsx
// Correct: one controller, a labelled tab list and matching panels.
<RequestPaneTabs>
  <section>
    <RequestPaneHeader comments={comments} />
    <RequestPanePanel value="overview">{context}</RequestPanePanel>
    {requestTimeline /* supplies Journey and Activity from one loader */}
    <RequestPanePanel value="conversation">{conversation}</RequestPanePanel>
  </section>
</RequestPaneTabs>
```

Render this under `DetailRequestProvider`; pass all four panels through the real
`RequestDetailView` composition. Do not add a second journey loader or put two
matching panel values in the same root. Do not make tab-looking anchors scroll a
long page: the selected label must match the only visible panel. Arrow keys and
Home/End use Radix's tab behavior; Tab enters the selected content.

## Spacing and surfaces

- Title, metadata, tabs and body share one reading-column inset and maximum width.
- Empty first-run guide slots take no space. The pane edge must meet the page strip
  when no guide is shown; do not add a compensating border or negative margin.
- The nested strip explicitly supplies `expand: null`, omitting the shell's sidebar
  placeholder. Only the page strip reserves room for the sidebar control.
- Separate content groups with `--space-6`; do not put a border above every section.
- Keep the pane's structural edge and strip boundary. Keep Arc CommentThread's
  outer border and composer separator; do not wrap every comment in another card.
- The active tab has one foreground underline. Inactive tabs use secondary ink.
- Timeline markers align to the first text line. Use the component's row padding
  and connector geometry together; reducing padding alone erases the connectors.
- Use existing type, icon and stroke tokens. Supporting metadata is smaller than
  body text; Request titles use the display family and medium weight.

```css
/* Correct: separation by space within the pane. */
.tabPanel { display: grid; gap: var(--space-6); }
/* Incorrect: repeats a divider around every logical group. */
.tabPanel > section { border-top: var(--border-width) solid var(--border); }
```

## Forms and state

Use `DetailConversation` with the installed `CommentThread`. Its optional Lane
extensions are `readOnly`, `composer` and `renderTimestamp`. `readOnly` suppresses
upstream reply/reaction/edit/resolve controls; Lane's supplied composer retains
the existing posting permission. Pass no composer for a Viewer. Do not enable
demo callbacks to fill visual space.

The textarea has an associated Comment label, linked validation error, plain
text behavior and the existing Command/Control+Enter shortcut. Post stays disabled
for empty content and while sending. Failure restores text. Keep the same form
instance when changing tabs, and retain the existing per-Request draft store.

## Motion and responsive behavior

Opening, replacing and switching Request tabs are immediate. These are repeated
reading actions; do not animate width, scroll position, content height or slide
the pane over the list. Arc's existing disclosures retain their motion and
reduced-motion handling. Existing history and static comments render immediately.

The preview is available at 768px and wider with a fine pointer. Narrow/touch
navigation uses the full Request page. At constrained desktop widths, the tab
strip may scroll horizontally; the page and pane body must not. The composer
stacks within its own narrow container. Touch inputs use the existing base size.

The dock is the `request-peek` size container. Edit/Delete become labelled icon
controls below 640px of **pane** width; below 480px, copy actions use the installed
Arc DropdownMenu. Open full page remains directly available. The toolbar stays
fixed; title, metadata, tabs and content share the scrolling body so long titles
cannot leave the selected section without usable space on short screens. The
loading skeleton uses the same structure and insets. Tab focus outlines draw
inside the horizontal scrolling strip rather than being clipped at its edges.

## Check before accepting

Verify different-row replacement, same-row close, Escape/focus return, keyboard
tabs, draft retention and error recovery. Check Polar and Lane palettes in light
and dark, with long content and short/narrow viewports. A fixture check proves
rendering and local interaction only; it does not prove authenticated posting or
deployed behavior. Run the repository's UI-only tests, typecheck, lint, design
contracts and build. Never run database-reset tests for a visual review.
