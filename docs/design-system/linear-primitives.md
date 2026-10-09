# Linear primitives through Arc components

The 2026-10-08 increment began as an opt-in Requests/sidebar preview. Linear supplies the visual values; Arc supplies the installed components, keyboard mechanics, portals and motion. Lane retains its product behaviour. **Production activation (2026-10-09):** Nikhil activated the primitives for the whole app, Request detail included. The root layout (`src/app/layout.tsx`) now imports both stylesheets and sets `data-visual-system="linear"` + `data-ui-state-contract="semantic"`; the compact rows are driven in production by `src/components/requests/request-row-actions.tsx` (saved `LAN-n` codes, the saved `priority` column from migration `0019`, status moves through the existing pick-up/Done actions, copy actions) and the sidebar renders the folder-tree Project navigation. Migration `0019` is on Lane Staging as of 2026-10-09 (with `0017` and `0018`); production still needs it. Marketing remains out of scope.

## Source and activation

`src/styles/linear-primitives.css` contains the exact LCH values captured from the applied Linear Light and Dark themes. There are 116 colour roles in each of three contexts—content, sidebar and floating menu—for each mode: 696 declarations. `linear-primitives-source.json` records the originating variable, role, scope, value and verification method. The complete earlier static export remains in `artifacts/linear-css-tokens-2026-10-08/`.

The initial token capture used computed styles and CSSOM, not screenshot colour sampling or execution of downloaded JavaScript. That capture temporarily changed Linear to Light and restored its then-current Dark preference. Root defaults were insufficient: the root retained a fallback background even in Light. The adapter therefore uses the actual content/sidebar/menu scopes. The later row audit below began and ended in Light.

`src/styles/linear-arc-theme.css` maps the captured values into existing Arc/Lane semantic hooks. The production root layout and the Linear Storybook stories both set `data-visual-system="linear"` and `data-ui-state-contract="semantic"`. Floating surfaces carry `data-ui-surface="floating"` so their portalled children receive the menu context. Switching to other stories restores the previous root attributes.

## Applied mapping

| Role | Linear source |
| --- | --- |
| Sidebar canvas | Sidebar `bgBase` |
| Content surface | Content `bgBase` |
| Group heading | Content `bgShade` |
| Main text / secondary text | `labelTitle` / `labelMuted` |
| Floating surface / text / border | Menu `bgBase` / `labelBase` / `bgBorder` |
| Default border / stronger control border | `bgBorder` / `bgBorderStrong` |
| Persistent selection | Content `bgSelected` with `labelTitle` |
| Selected pill/avatar stroke | Content `bgBorderStrong`, 1px |
| Link and emphasis | `labelLink` |
| Checkbox fill / glyph | `controlPrimary` / `controlPrimaryLabel` |
| Main button | Neutral inverse pair: `labelTitle` / `bgBase` |
| Project markers | Linear blue/green/purple/yellow/orange base roles and muted neutral |

Examples of exact applied values:

| Surface | Light | Dark |
| --- | --- | --- |
| Content | `lch(97.94% 0.5 282)` | `lch(5.52% 0.4 272)` |
| Sidebar | `lch(94.44% 0.5 282 / 1)` | `lch(2.595% 0.4 272 / 1)` |
| Floating menu | `lch(100% 0 282)` | `lch(12.72% 0.85 272)` |
| Selected row | `lch(92.254% 5.903 282.518 / 1)` | `lch(12.141% 17.792 286.445 / 1)` |

The source record is authoritative for exact precision. No custom hex palette, screenshot approximation or Geist colour ramp participates in this preview.

## Geometry and typography

| Element | Verified source measurement / application |
| --- | --- |
| Request row | 44px height, 8px corners; single line at every width |
| Metadata pill | 24px visual height, 8px inline padding, 12px type at weight 450 |
| Checkbox square | 14px visual size, 3px corners, independent hit area |
| Desktop toolbar control | 28px visual height |
| Sidebar link | 28px desktop height, 8px corners |
| Pane and popup | 12px corners; popup border 0.5px |
| Menu item | 32px desktop height; 13px type / 19.5px line height |
| Header strip | 43.5px |
| Request title | 13px / weight 500 / normal line height |

The existing Inter font remains. Font-size definitions and input/control corners also have static ThemeHelper evidence; these are distinguished from measured DOM geometry. The finite spacing vocabulary (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px) is found in actual source padding/margin/gap declarations. It is an application adapter, not a claim that Linear publishes a universal spacing scale. Arc components and motion remain; compact row composition and progressive metadata hiding are Lane adaptations.

## Live row inspection and usage rules

On 2026-10-08 the actual Linear My issues list was inspected again in Chrome, including the Priority submenu and several viewport widths. Computed styles are recorded in `linear-row-live-audit-2026-10-08.json`. Linear's original Light appearance was restored after temporary Dark inspection. These are applied DOM/CSSOM values, not screenshot samples.

| Pill role | Light | Dark | Adapter |
| --- | --- | --- | --- |
| Fill | `lch(97.94% 0.5 282)` | `lch(5.52% 0.4 272)` | Content `bgBase`, identical to the unselected content surface |
| Stroke | `lch(84.44% 0 282)` | `lch(16.32% 1.48 272)` | Content `bgBorderSolid`, 0.5px |
| Label | `lch(39.176% 1.25 282)` | `lch(61.803% 1.2 272)` | Content `labelMuted`, 12px / 450 |

Do not map list pills to `bgShade` or tinted status backgrounds. Put status before the title as a glyph: neutral Open ring, sourced yellow In Progress ring, primary-colour Done check. Keep Project/Request type glyphs distinct; pill labels remain neutral. The source's custom Bug marker was `rgb(235,87,87)` and its project glyph was workspace-specific, so these are observations rather than a universal colour scale. Lane continues to use the captured Linear utility roles for its own Project/type markers. Submitted date is plain text after the avatar, not a pill.

Selected metadata retains the earlier explicit Lane decision: same fill as the selected row, a visible 1px `bgBorderStrong` stroke and neutral selected text. Code text follows selected text; status glyph hue remains meaningful. Avatars stay 24px to match pill height (native Linear measured 18px). No shadows. Identity controls use filled keyboard focus; phone/coarse targets are 44px while glyphs remain 16px.

For meaningful Urgent and In Progress glyphs, use the captured `orangeText` and `yellowText` roles rather than their base fills. The Light urgent base failed the rendered icon contrast check at 2.57:1; the text roles maintain the same hue and pass the 3:1 icon threshold in both modes. This is a deliberate accessible mapping within the Linear palette, not an exact copy of its yellow status glyph.

### Responsive sequence

Use available row width for metadata, and viewport width for the shell. They are separate thresholds: collapsing the sidebar increases available row width and brings metadata back automatically.

1. Title is `nowrap` + ellipsis. No row or pill wrapping.
2. Submitted date hides at 700px available row width; pills hide at 640px. Picker avatar remains.
3. At viewport width 880px or below, the sidebar automatically collapses. It starts at 254px above that breakpoint. Saved manual width/collapse preference is retained and restored on widening.
4. The wider main pane restores pills when it exceeds 640px. Narrowing it again hides pills. Code hides at phone widths (640px viewport); checkbox, priority, status, title and picker remain.
5. The collapsed control uses existing hover peek and click/keyboard opening; the left corners remain square. At phone widths the preview uses this same affordance, with 44px hit targets.

Live Linear measurements: at 910px viewport its 647px row still had pills; at 900/890px its 637/627px rows did not. At 880px the sidebar collapsed and pills returned. At 660px viewport pills remained; at 640px they disappeared and the avatar remained. Lane's content gutters mean the second disappearance occurs at a different viewport width, while preserving the same available-row-width rule. Some intermediate geometry in the evidence was captured during Linear's sidebar animation; the values are not represented as settled geometry.

### Preview identity and context actions

`LinearRequestsFixture` supplies illustrative `LAN-1` etc. codes, priorities and in-memory Status/Picker/Project/Request type changes. Right-click or Shift+F10 opens Arc's nested ContextMenu; priority/status glyphs also open their choices directly. Status changes regroup the row and restore focus to the visible Request, or to the filter control when the Request is hidden. Copy offers code/title and an explicitly labelled preview link. No server action, stored priority, new public identifier, or production feature is implied. Existing Requests outside this opt-in presentation keep their prior APIs.

Lane retains Open → In Progress → Done. Extra statuses, saved identifiers/priorities and unsupported menu features are tracked separately in `../superpowers/plans/2026-10-08-request-properties-follow-up.md` and `DEFERRED.md`.

## Deliberate mappings and preserved decisions

- Shadows are disabled, including control-thumb and decorative inset/presence shadows.
- Picker avatars match the 24px pill height as requested; Linear's own list avatar measured 18px.
- Selected metadata shares the row fill and retains a visible 1px stroke. The stronger sourced border role passes 3:1 against that fill. Adjacent selected rows join; separate selected rows retain outer corners.
- Selected hover/press keeps the persistent fill stable, as requested. Checkbox focus changes the square; pointer exit after deselection restores the normal row surface.
- Small status labels use neutral `labelBase`, with hue on the glyph. Original coloured labels on Arc's tinted pills failed 4.5:1 in Light.
- The Light primary accent button pair measured 3.94:1. Main actions therefore use the sourced neutral inverse pair; selection and links retain Linear's accent.
- Light destructive text uses sourced `redBg`: `redText` on the content surface measured 4.38:1. Dark uses `redText`. Search-match text uses `labelTitle` on `bgSelected` after the accent-hover role failed as small text.
- Phone/coarse-pointer controls retain 44px height. The later compact-prefix correction below narrows only the row checkbox/priority/status widths, as explicitly requested. Arc motion, disabled/loading behaviour, reduced-motion branches, resize and peek controllers remain.

## Initial token review

`Review/Linear primitives` has 14 stories: Requests, adjacent and separate selection, deselection, toolbar menus, search, sidebar peek, account menu, property menus, empty, loading, failed-load recovery, long title and controls. Each passed at 390, 768, 1024 and 1440px in both modes: 112 browser-story runs. Assertions include text/control contrast, joined corners, visible metadata strokes, avatar height, portal context, fixed popup radius, no shadow, Escape/focus return and retry behaviour.

Production build and static Storybook build passed. TypeScript passed; lint has zero errors and existing warnings from the archived third-party JavaScript and pre-existing files. Arc source verification passed with 63 recorded files and 29 documented adaptations. The seven existing menu/selection/sidebar regression files also passed 53/53 at desktop Light and 53/53 at phone Dark (106 runs).

These are local checks with illustrative fixtures, not hosted Clerk or production verification. Review screenshots are saved under `artifacts/linear-primitives-review-2026-10-08/`. Production activation remains a separate scoped decision because a root theme change would also affect the excluded Request detail.

## Row and responsive review — 2026-10-08

The current suite has 16 Linear stories, adding Responsive rows and Row context menu. The combined 16 preview + 10 sidebar-resize stories passed at 1440px and 390px in Light and Dark (104 runs). The four relevant breakpoint stories passed at 940px, 880px and 650px in both modes (24 runs). Existing Arc request-selection/sidebar-peek regressions passed 18/18 at desktop Light and 18/18 at phone Dark.

After the icon contrast correction, all 16 preview stories passed again at 1440px and 390px in both modes (64 runs). After the final metadata alignment adjustment, Requests/Selected/Responsive rows passed at 940px in both modes (6 runs). Tests cover single-line geometry, visible avatar, pills hiding by available width, joined selection and strokes, pointer/keyboard nested menus, status regrouping/focus, and rendered icon contrast. The nested Arc menu suite and existing Project menu suite passed 14/14 at desktop; all six nested-menu cases also passed at 390px Dark.

Manual browser checks compared Linear in both themes, exercised the Priority submenu, verified widths from desktop to phone, and confirmed that a manually resized or collapsed Lane sidebar restores its prior state after the automatic breakpoint. Linear was returned to its original Light appearance and My issues page. Temporary viewport overrides were reset.

Final TypeScript, focused ESLint, Arc provenance, whitespace, static Storybook build and isolated production compile checks passed. The initial sandboxed Storybook build could not fetch Google Fonts; the permitted network retry passed. This remains local fixture verification. Screenshots of the updated rows and menu are in `artifacts/linear-row-review-2026-10-08/`; exact source measurements are in `linear-row-live-audit-2026-10-08.json`.


## Toolbar and narrow-row refinements — 2026-10-08

The follow-up remains opt-in Requests/sidebar Storybook work. The group + and summary controls are gated by `RequestRowPresentation`; production does not supply it. No new backend field/action, route, lifecycle or Request-detail surface was introduced.

- Narrow prefix: checkbox target is 28×44px and priority/status targets are 24×44px, with a 4px gap between priority/status controls. These meet the 24px target-size floor and retain 44px height, avoiding the prior three widely spaced 44px targets. Glyphs stay 14/16px and rows 44px; title ellipsis and metadata thresholds are retained.
- Status views: the later drawer/chips refinement below replaces the segmented bar with Arc ChipGroup. At narrow widths, the chips take a full line and actions sit below.
- Assigned picker: the existing stable identity hash maps current `assignedTo` to captured Linear colour tints with `labelTitle` initials. Photos/failure fallback are still Arc Avatar. The visible circle remains 24px, matching pills. Unassigned stays neutral. Selected avatars retain the agreed shared row fill and 1px stroke.
- Sidebar hover/focus/press uses neutral sidebar `bgBaseHover`/`bgShadeHover`; persistent selection remains distinct. No palette was sampled from screenshots or hand-picked.
- Status-group +: a sibling `NewRequestLink`, separate from the collapse button, opens the existing `NewRequestProvider`/Intake composer. The preview now mounts that provider under its existing Storybook server-action boundary. The originating group does not set a creation status; the existing Open creation contract, AI gate and draft retention remain authoritative.
- Filter: retain the existing Arc field/value picker and title search. Add supported Status/Project count hints only in the preview. Unsupported Linear fields are omitted.
- Display: retain actual grouping/ordering/property controls; hiding Status now hides the compact prefix glyph as well. Code and priority are still illustrative context-menu properties, not saved display fields.
- List summary: the panel icon opens a breakdown of the matching, accessible fixture rows before pagination. Status, Project and Request type counts filter the existing list; selecting the active value clears it. It focuses on opening, closes with Escape or its close button and restores trigger focus. The later drawer refinement below gives it a full-height right panel; it no longer precedes the list at narrow widths. It does not inspect a Request or claim workspace-wide/backend totals.

The live Linear audit and additional feature decisions are recorded in `../superpowers/plans/2026-10-08-request-properties-follow-up.md`. Existing Arc Button, SegmentedControl, FilterMenu, Popover, ChipGroup, Select, Avatar, Drawer and the composer are reused. Summary count rows compose native button semantics with the installed Arc button styles; no registry source files were changed in this refinement.


### Follow-up verification

All 19 Linear preview stories passed at 390px and 1440px in Light and Dark (76 runs). Requests, Responsive rows and List summary passed at 320/768/1024px in both modes (18 runs). These include composer opening from all three status headers with Escape/focus return, all three summary filters and clearing, summary focus, actual Status visibility, avatar contrast/height and the existing selection/menu checks. Normal Arc Requests/selection/sidebar regressions passed 52/52 at desktop Light; selection/sidebar passed 18/18 at phone Dark.

Manual CUA review confirmed compact 28×44/24×44/24×44 prefix targets, 44px rows and no document overflow at 390px; Light and Dark phone appearance and the desktop summary were inspected. Filter/Display were manually opened in Lane and the In Progress group + loaded the existing Intake fields including Expected impact. The live Linear reference was left in Light with temporary filters and panels cleared. Temporary preview viewport overrides were reset at handoff.

TypeScript, focused ESLint, Arc provenance (63 recorded files, 29 existing adaptations), whitespace, static Storybook build and isolated `.next-audit` webpack production build passed. Logs and a compact verification record are in `artifacts/linear-refinements-2026-10-08/`. This is local fixture verification, not hosted production evidence or approval of a visual baseline.


## Drawer, status chips and Projects folder — 2026-10-08

Nikhil requested Arc Cart drawer motion, Linear panel layout, smaller existing icons, status chips, and only the Docs sidebar folder-tree structure. He clarified that Projects remain unchanged inside one collapsible folder. All changes stay in the opt-in Requests/sidebar review; no icons were fetched from better-icons.

The live Linear My issues panel measured 350px wide below the toolbar, with an independently scrolling list and an inset panel spanning the remaining height. Its toolbar buttons measured 28px with 14px SVGs. Lane now reserves the same 350px on wide panes and animates the panel from the right using the actual Arc Cart drawer's critically damped 0.42-second physical spring. The list and pagination share their own scroll region; the header and toolbar remain fixed. At main-pane widths up to 760px the right panel overlays the list within the available bounds, and the covered list leaves the focus order while open. Reduced motion fades without sliding; outgoing content is inert, Escape closes, and focus returns to the trigger.

Request status and summary dimensions use the installed Arc ChipGroup with single selection. Clearing a status chip returns to All. Toolbar and sidebar navigation/action SVGs are 14px through preview-only props/hooks; their touch targets retain 44px on phone/coarse-pointer devices. Existing row glyphs, Project dots and 24px avatars retain their distinct geometry.

Projects uses the sourced Docs folder button, indented branch guide, chevron and height fold within the existing WorkspaceSidebar. Links, context menus, selection and creation are preserved; New Project stays outside the fold. Native Tab from the folded Projects button reaches New Project. The automated focus check explicitly tests that a retained inert Project link cannot take focus, because the installed Testing Library Tab simulation does not account for inert.

### Drawer refinement verification

The 21 Linear preview stories plus 3 Projects-folder stories passed at 390px and 1440px in both themes (96 runs). Six relevant stories passed at 320px with reduced motion. Drawer layout/filter checks also passed at 768px. Final review found and reproduced a close→immediate-reopen focus defect; focus now follows restored presence, and the two drawer stories passed again on desktop and at 390px Dark with reduced motion. The normal Arc Requests/selection/sidebar suites passed 52/52.

TypeScript, focused lint, Arc source verification, whitespace and static Storybook build passed. The composer test now allows its existing lazy-loaded form up to five seconds to become ready; this addresses the original one-second assertion racing concurrent build work. Manual CUA inspection covered both phone themes, the desktop panel, the supplied 1047×977 viewport and native Tab through the folded folder. Temporary viewport overrides were reset and Linear's reference panel was closed. The completed Lane preview is left open in Chrome; the in-app browser connection timed out during this pass. Logs and the compact record are in `artifacts/linear-drawer-2026-10-08/`. These are local fixture checks, not hosted production verification or approval of a visual baseline.
