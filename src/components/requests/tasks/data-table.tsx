"use client"

import { listViewModel, showMore, viewResets, withRowShown, type ListGroup } from "../list-view-model"
import { Fragment, memo, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
import { AnimatePresence } from "motion/react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { KeyCap } from "@/components/keyboard/key-caps"
import { listViewHref, usePublishHighlightedRequest, useRequestListUrlSync, useRequestListView, withEmptyWorkspaceStatus, withListContext } from "@/components/requests/list-view-state"
import { withListFilter, withoutAddedFilters } from "@/components/requests/list-filters"
import { listEmptyLine } from "../list-empty-state"
import { ListEmptyState } from "../list-empty-state-view"
import { usePendingMutations, usePendingRows } from "@/components/requests/pending-mutations-provider"
import { RequestWorkspaceKeyboard } from "../request-workspace-keyboard"
import type { FinishedCounts, OverviewRequest } from "@/lib/request-overview"
import { requestListHref, parseRequestStatusFilter, type FinishedView, type RequestStatusFilter } from "@/lib/request-workspace"
import { NewRequestLink } from "../new-request-link"
import { useRequestRowPresentation } from "../row-presentation"
import { RequestListSummary as ListSummary } from "../request-list-summary"
import { DataTableToolbar as Toolbar } from "./data-table-toolbar"
import { RequestRow } from "../request-row"
import { useRequestSelection } from "../use-request-selection"
import { RequestSelectionBar } from "../request-selection-bar"
import { useListAnnouncer } from "../list-announcer"
import { matchCountText, requestCount } from "../request-row-label"
import { useRequestGrid } from "../use-request-grid"
import { gridKeysFor, groupOfKey, requestIdOf } from "../request-grid-keys"
import { focusRowWhenShown, restoreRequestFocus } from "../list-focus"
import { RequestPeek, RequestPeekOpener, preloadRequestPeek, usePeekAvailable, type PeekViewer } from "../request-peek"
import { isSameTabRequestLink, useRequestNavigation } from "../request-navigation"
import { RequestPeekLoadAhead, useListLoadAhead } from "../request-peek-load-ahead"
import { captureSequence } from "../request-sequence"
import { useListFeel } from "../list-feel"
import type { RequestColumn } from "./columns"
import styles from "../request-rows.module.css"
import layoutStyles from "./data-table-toolbar.module.css"
import buttonStyles from "@/components/arc/button/button.module.css"

// Plan item 2.4: the roving tab stop lives in DataTable, so a J, K or arrow
// re-renders it. These parts take stable props and skip that render; only the
// two rows whose tab stop moved re-render (RequestRow is memoised too).
const DataTableToolbar = memo(Toolbar)
const RequestListSummary = memo(ListSummary)

/**
 * A212: the older finished Requests behind each finished group's Show more (requests-overview.tsx): which reads
 * have more on the server, the one in flight, the last failure and its read, and how to start one.
 */
export type OlderReads = {
  more: Partial<Record<FinishedView, boolean>>
  pending: FinishedView | null
  error: { read: FinishedView; message: string } | null
  load: (read: FinishedView) => void
}

/**
 * Plan item 1.7: the status view and Project filter come from the layout's
 * list view state, not from server props, so switching either (and group,
 * sort and the in-list filter) re-renders here with no network request. The
 * "/" URL mirrors that state through useRequestListUrlSync.
 */
export function DataTable({ columns, data: serverRows, projectName, context, isGuest = false, footer, welcome, viewer, finishedCounts, older }: { columns: RequestColumn[]; data: OverviewRequest[]; projectName?: string; context?: { orgId: string }; isGuest?: boolean; footer?: ReactNode;
  /** A212: every finished Request's count by status, for the group headers; without it, groups count what is loaded. */
  finishedCounts?: FinishedCounts
  /** A212: the older-finished reads behind Show more; without them, Show more shows loaded rows only. */
  older?: OlderReads
  /** Plan item 2.1: shown in the records region while the workspace has no Requests at all. */
  welcome?: ReactNode
  /** Plan item 2.12: who is reading, for the Request preview. Without it (older fixtures) the list offers no preview. */
  viewer?: PeekViewer }) {
  const presentation = useRequestRowPresentation()
  const layoutRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const summaryTrigger = useRef<HTMLButtonElement>(null)
  const groupId = useId()
  const [view, setView] = useRequestListView()
  const { ordering, grouping, collapsedGroups, status: filter, project: projectFilter } = view
  // Plan item 1.5: pending lifecycle and priority moves apply before grouping
  // and sorting, so an optimistic change regroups the row in the next frame.
  const pendingMutations = usePendingMutations()
  const data = usePendingRows(serverRows)
  const hold = (pendingMutations?.unconfirmed ?? 0) > 0
  useRequestListUrlSync(view, setView, hold)
  // Plan item 2.1: `data` already carries composer inserts, so the first Request
  // ends the empty state in the same frame. It is read before any filter, so a
  // status, Project or title filter never shows the welcome. Both states render
  // the same tree; only the records region's content swaps.
  const workspaceEmpty = welcome !== undefined && data.length === 0
  // Nothing to filter yet, so a status from the URL goes before paint: the first
  // Request then lands in the "all" view. The URL sync above mirrors it with
  // replaceState (no navigation), and still holds while a mutation is pending.
  useLayoutEffect(() => {
    if (workspaceEmpty && filter !== "all") setView(view => withEmptyWorkspaceStatus(view, true))
  }, [workspaceEmpty, filter, setView])
  const viewColumnVisibility = view.columnVisibility
  const columnVisibility = useMemo<Record<string, boolean>>(() => ({ project: projectFilter === "all", ...viewColumnVisibility }), [projectFilter, viewColumnVisibility])
  // The composer's hidden-by-filters toast reads the same filters (plan item 2.3).
  const olderMore = older?.more
  const server = useMemo(() => ({ finishedCounts, olderMore }), [finishedCounts, olderMore])
  const model = useMemo(() => listViewModel(view, data, server), [view, data, server])
  const { groups, matching, visibleRows } = model
  const { title, requestType } = model.filters
  const project = projectFilter === "all" ? "" : projectFilter
  // A Viewer (#210) files nothing and moves nothing: no New Request in the Open group, no bulk move.
  const readOnly = viewer?.readOnly ?? false
  const selectionScope = viewResets.selection(view, { orgId: context?.orgId, isGuest, readOnly })
  const selection = useRequestSelection(selectionScope, visibleRows, context, isGuest, readOnly)
  const announce = useListAnnouncer()
  // Plan item 2.12: the Request preview beside the list. Space or the row menu opens it; it follows
  // the list's active row (J and K). Below 1280px, phones and touch screens open the full page (#240 decision 2).
  const peekAvailable = usePeekAvailable() && Boolean(presentation && context && viewer)
  const [peekId, setPeekId] = useState<string | null>(null)
  const shownPeek = peekAvailable ? peekId : null
  const peekIdRef = useRef(peekId)
  useLayoutEffect(() => { peekIdRef.current = peekId })
  const openPeek = useCallback((id: string) => {
    // Said once on opening; following J and K reads the row's own name instead.
    if (!peekIdRef.current) announce("Preview open. Esc closes it.", { key: "preview" })
    setPeekId(id)
    // One panel at the list's edge: the preview and the summary replace each other.
    setSummaryOpen(false)
    preloadRequestPeek()
  }, [announce])
  // #258: resting on a row reads it ahead of the preview (not by focus while the preview is open).
  const loadAhead = useListLoadAhead(context?.orgId, viewer?.id, { offered: peekAvailable, previewOpen: peekId !== null })
  // Plan item 2.4 (decision 8.24): the list is a treegrid when grouped and a
  // grid when not, with the row as its one tab stop (use-request-grid.ts).
  const grouped = grouping !== "none"
  // A212: the grid walks each group's shown rows and its Show more; no page edges.
  const gridKeys = useMemo(() => gridKeysFor(groups.map(group => ({ key: group.key, rows: group.shown, more: group.more })), { headers: grouped, collapsedGroups }), [grouped, groups, collapsedGroups])
  const rowGroups = useMemo(() => new Map<string, string>(groups.flatMap(group => group.rows.map(row => [`r:${row.id}`, group.key] as const))), [groups])
  const grid = useRequestGrid({
    gridRef, scopeRef: layoutRef, keys: gridKeys,
    groupOf: key => grouped ? rowGroups.get(key) ?? groupOfKey(key) : null,
    isCollapsed: group => collapsedGroups.includes(group),
    setCollapsed: (group, collapse) => setView(previous => ({ ...previous, collapsedGroups: collapse ? [...previous.collapsedGroups.filter(key => key !== group), group] : previous.collapsedGroups.filter(key => key !== group) })),
    toggleSelected: id => selection.toggle(id, !selection.selected.some(row => row.id === id)),
    onNavigate: id => { if (peekAvailable && peekIdRef.current) openPeek(id) },
    onPeek: id => {
      if (!peekAvailable) return false
      // Space on the previewed row closes the preview; focus is already on the row.
      if (shownPeek === id) setPeekId(null)
      else openPeek(id)
      return true
    },
  })
  const setGridActive = grid.setActive
  const focusGridKey = grid.focusKey
  const activeRequestId = grid.activeKey ? requestIdOf(grid.activeKey) : null
  // #103: the shell's current Request when nothing is open; the ticked rows never count.
  usePublishHighlightedRequest(activeRequestId)
  let nextPeekId = peekId
  // A filter or view change that leaves the previewed Request out of the shown rows closes the
  // preview. A change made in the preview that moves its Request out of the view does not: that
  // is no view change.
  const viewSignature = viewResets.preview(view)
  // #275: rows slide into place, Back finds the list where it was (A232), a hidden tab's return reads fresh rows.
  // A212: and a group reads the older Requests it should show (a reload, or a Show more whose read added none of its own).
  useListFeel({ grid: gridRef, scroller: scrollRef, rows: gridKeys, still: viewSignature, href: listViewHref(view), scope: context && viewer ? `${context.orgId}:${viewer.id}` : null, orgId: context?.orgId ?? null, hold, groups, shownCounts: view.shownCounts, older })
  const [peekView, setPeekView] = useState(viewSignature)
  if (peekView !== viewSignature) {
    setPeekView(viewSignature)
    if (nextPeekId && !gridKeys.includes(`r:${nextPeekId}`)) nextPeekId = null
  }
  // #240 decision 2: a window narrowed below 1280px closes the preview and focus goes back to its row (below);
  // widening it again does not bring one back unasked.
  const [lostPeek, setLostPeek] = useState<{ id: string } | null>(null)
  if (!peekAvailable && nextPeekId) { setLostPeek({ id: nextPeekId }); nextPeekId = null }
  if (nextPeekId !== peekId) setPeekId(nextPeekId)
  // A211 (#275): Preview from the row menu leaves focus on the row itself, as Escape from the menu does.
  const peekFromMenu = useMemo(() => peekAvailable ? (id: string) => { focusGridKey(`r:${id}`); openPeek(id) } : null, [peekAvailable, focusGridKey, openPeek])
  const leavePeek = useCallback((id: string) => {
    announce("Preview closed.", { key: "preview" })
    // Back to the previewed Request's row, else the row that took its place.
    if (gridKeys.includes(`r:${id}`)) focusGridKey(`r:${id}`)
    else restoreRequestFocus(id, { force: true })
  }, [gridKeys, focusGridKey, announce])
  const closePeek = useCallback(() => {
    const id = peekId
    setPeekId(null)
    if (id) leavePeek(id)
  }, [peekId, leavePeek])
  const returnFromLostPeek = useEffectEvent((id: string) => {
    // Only focus that was in the preview, or went with it, comes back: a person typing in the toolbar keeps their place.
    const focused = document.activeElement
    if (!focused || focused === document.body || focused.closest("[data-request-peek]")) leavePeek(id)
  })
  useEffect(() => { if (lostPeek) returnFromLostPeek(lostPeek.id) }, [lostPeek])
  const peekRow = useMemo(() => shownPeek ? serverRows.find(row => row.id === shownPeek) ?? null : null, [serverRows, shownPeek])
  // Plan item 2.5: opening a Request from the list records the order it shows,
  // shown or not, so detail can offer previous and next. The row menu's
  // "Open Request" and Enter both click the title link, so one capture covers all three.
  const navigation = useRequestNavigation()
  // All preview paths converge here: pointer/menu, active row, close, filters and
  // breakpoint changes. Invalidate before paint, not after Arc's exit unmount.
  useLayoutEffect(() => { navigation.previewChanged(shownPeek) }, [navigation, shownPeek])
  const captureOpen = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    const row = target?.closest<HTMLElement>("[data-request-id]")
    const openedId = row?.dataset.requestId
    if (!openedId) return
    const link = target?.closest("a[data-request-title]")
    // The whole reading surface toggles detail. Labelled controls keep their own actions.
    if (!link && target?.closest("button, a, input, select, textarea, [role='checkbox'], [role='menuitem'], [contenteditable='true']")) return
    if (link instanceof HTMLAnchorElement && link.target && link.target !== "_self") return
    const selectedText = window.getSelection()
    if (selectedText?.toString() && row?.contains(selectedText.anchorNode)) return
    // Enter and Open Request still follow the real link; modifiers retain native new-tab behavior.
    if (peekAvailable && event.detail > 0) {
      event.preventDefault()
      if (peekIdRef.current === openedId) closePeek()
      else {
        focusGridKey(`r:${openedId}`)
        openPeek(openedId)
      }
      return
    }
    if (!link) {
      row?.querySelector<HTMLAnchorElement>("a[data-request-title]")?.click()
      return
    }
    navigation.prepareDetail(openedId, { sequence: captureSequence(matching.map(row => row.id), openedId) })
  }, [matching, navigation, peekAvailable, focusGridKey, openPeek, closePeek])
  const setFilter = useCallback((id: string, value: string) => setView(previous => withListFilter(previous, id, value)), [setView])
  // A215: Clear all and Clear filters clear what was added, never the status pill or the page's Project.
  const clearFilters = useCallback(() => setView(withoutAddedFilters), [setView])
  const setStatus = useCallback((next: RequestStatusFilter) => setView(previous => withListContext(previous, { status: next })), [setView])
  const setVisibility = useCallback((next: Record<string, boolean>) => setView(previous => ({ ...previous, columnVisibility: { ...previous.columnVisibility, ...Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== (columnVisibility[key] !== false))) } })), [setView, columnVisibility])
  const setOrdering = useCallback((next: typeof ordering) => setView(previous => ({ ...previous, ordering: next, shownCounts: {} })), [setView])
  const setGrouping = useCallback((next: typeof grouping) => setView(previous => ({ ...previous, grouping: next, collapsedGroups: [], shownCounts: {} })), [setView])
  const filterFromSummary = useCallback((field: string, value: string) => {
    if (field === "status") setView(previous => withListContext(previous, { status: parseRequestStatusFilter(value) }))
    else setFilter(field, value)
  }, [setView, setFilter])
  const closeSummary = useCallback(() => { setSummaryOpen(false); summaryTrigger.current?.focus() }, [])
  const changeSummary = useCallback((open: boolean) => { setSummaryOpen(open); if (open) setPeekId(null) }, [])
  // Open full page from the preview records the list's order, as Enter on the row does (captureOpen).
  const openPeekFullPage = useCallback((event: ReactMouseEvent<HTMLAnchorElement>) => {
    // A new tab or window leaves this tab's detail session alone, as on the row (captureOpen).
    if (!peekId || !isSameTabRequestLink(event)) return
    navigation.prepareDetail(peekId, { sequence: captureSequence(matching.map(row => row.id), peekId) })
  }, [matching, peekId, navigation])
  const restoreRequest = useCallback((id: string) => {
    if (!matching.some(row => row.id === id)) return
    // Its group unfolds and shows enough to hold it. A modal may temporarily refuse row focus: an unchanged view
    // keeps this callback's inputs stable while the existing focus attempt waits, rather than restarting it.
    setView(previous => withRowShown(previous, groups, id))
    // The returning row also takes the grid's tab stop.
    setGridActive(`r:${id}`)
  }, [matching, groups, setView, setGridActive])
  // A212: Show more adds 25 to its group, reading older finished Requests once the loaded ones run out. Focus moves
  // to the first row it adds (once a read brings it), where the button was, so J and K carry on from there.
  const moreFocus = useRef<{ group: string; index: number } | null>(null)
  const pendingRead = older?.pending ?? null
  const loadOlder = older?.load
  const showGroupMore = useCallback((group: ListGroup) => {
    const { read } = showMore(view, group)
    setView(previous => showMore(previous, group).view)
    if (read) loadOlder?.(read)
    moreFocus.current = { group: group.key, index: group.shown.length }
  }, [view, setView, loadOlder])
  useLayoutEffect(() => {
    const wanted = moreFocus.current
    if (!wanted) return
    const target = groups.find(group => group.key === wanted.group)?.shown[wanted.index]
    if (!target && pendingRead) return
    moreFocus.current = null
    // Only while focus is still on that Show more, or was dropped with it: a person who moved on keeps their place.
    const focused = document.activeElement
    const onMore = !focused || focused === document.body || Boolean(focused.closest(`[data-grid-row="${CSS.escape(`m:${wanted.group}`)}"]`))
    if (target && onMore) focusGridKey(`r:${target.id}`)
  }, [groups, pendingRead, focusGridKey])
  // Plan item 2.3: "Show it" on the composer's toast moved the view to one that
  // holds the new Request. Bring it into its group's shown rows, focus it, and
  // clear the request, as the return-focus marker does.
  const reveal = view.reveal
  const revealRow = useEffectEvent((id: string) => restoreRequest(id))
  useEffect(() => {
    if (!reveal) return
    revealRow(reveal)
    // Plan item 2.4: the row, the list's one tab stop, not its title link.
    return focusRowWhenShown(reveal, () => setView(previous => previous.reveal === reveal ? { ...previous, reveal: undefined } : previous))
  }, [reveal, setView])
  // Plan item 2.4 (decision 8.11): while a filter is on, the result count is
  // announced once the person stops changing filters; removing the last one
  // says so. A count that changes only because the data did is not announced,
  // and nothing is said on the first render.
  const filterSignature = viewResets.announcement(view)
  const announcedFilters = useRef(filterSignature)
  const matchCount = matching.length
  useEffect(() => {
    if (announcedFilters.current === filterSignature) return
    announcedFilters.current = filterSignature
    if (workspaceEmpty) return
    if (filter !== "all" || projectFilter !== "all" || title || requestType) announce(`${matchCountText(matchCount)}.`, { key: "count", delay: 600 })
    else announce("Filters cleared.", { key: "count" })
  }, [announce, filter, filterSignature, matchCount, projectFilter, requestType, title, workspaceEmpty])
  const emptyLine = listEmptyLine(model.filters, { workspaceEmpty, readOnly })
  const gridLabel = projectName ? `${projectName} Requests` : projectFilter === "none" ? "Requests without a Project" : isGuest ? "My Requests" : "Requests"
  const olderError = older?.error ?? null
  // A failed read says so under its group's Show more, or below the list when no shown group continues that read.
  const errorInGroup = olderError !== null && groups.some(group => group.older === olderError.read && (!grouped || !collapsedGroups.includes(group.key)))
  const renderMore = (group: ListGroup, level?: number) => {
    if (!group.more) return null
    const key = `m:${group.key}`
    const error = olderError && group.older === olderError.read ? olderError.message : null
    return <div role="row" aria-level={level} aria-label={grouped ? `Show more ${group.label} Requests` : "Show more Requests"} tabIndex={grid.tabbable === key ? 0 : -1} data-grid-row={key} className={layoutStyles.showMoreRow}>
      <div role="gridcell" className={layoutStyles.showMoreCell}>
        <Button variant="ghost" size="sm" tabIndex={-1} loading={group.older !== null && pendingRead === group.older} onClick={() => showGroupMore(group)}>Show more</Button>
        {error && <p role="alert" className={layoutStyles.showMoreError}>{error}</p>}
      </div>
    </div>
  }
  const renderRow = (request: OverviewRequest, level?: number) => <RequestRow key={request.id} request={request} columns={columns} visibility={columnVisibility} level={level}
    tabbable={grid.tabbable === `r:${request.id}`} previewed={shownPeek === request.id} checked={selection.selected.some(row => row.id === request.id)} disabled={selection.busy} onCheckedChange={checked => selection.toggle(request.id, checked)} />
  return <RequestPeekOpener value={peekFromMenu}><RequestPeekLoadAhead value={loadAhead}><div ref={layoutRef} className={layoutStyles.tableLayout} data-preview-table={presentation ? "" : undefined}>
    <RequestWorkspaceKeyboard returnHref={requestListHref(filter, projectFilter)} onRestoreRequest={restoreRequest} />
    <div className={layoutStyles.listAndSummary} data-summary-open={summaryOpen || undefined} data-preview-open={shownPeek ? "" : undefined}>
    <div className={layoutStyles.listPane} data-empty-workspace={workspaceEmpty || undefined}>
    <DataTableToolbar controls={!workspaceEmpty} data={data} filter={filter} title={title} project={projectFilter} projectAdded={view.projectAdded} requestType={requestType} matchCount={matching.length} columns={columns} columnVisibility={columnVisibility} ordering={ordering} grouping={grouping}
      summaryOpen={presentation ? summaryOpen : undefined} onSummaryChange={changeSummary} summaryTrigger={summaryTrigger}
      onFilterChange={setFilter} onStatusChange={setStatus} onVisibilityChange={setVisibility} onOrderingChange={setOrdering} onGroupingChange={setGrouping} onClear={clearFilters} />
    <div ref={scrollRef} className={layoutStyles.listScroll}>
    <div className={`${styles.records} ${layoutStyles.recordRegion}`}>
      {emptyLine.kind === "welcome" ? welcome : !matching.length ? <ListEmptyState line={emptyLine} status={filter} onClear={clearFilters} />
        : <div ref={gridRef} role={grouped ? "treegrid" : "grid"} aria-label={gridLabel} aria-multiselectable="true" className={styles.list} data-request-grid="" {...grid.gridProps} onClickCapture={captureOpen}
          // A keyboard user on a row may press Space next: fetch the preview's code ahead of it.
          onFocus={event => { grid.gridProps.onFocus(event); if (peekAvailable) preloadRequestPeek() }}>
          {!grouped ? groups.map(group => <Fragment key={group.key}>{group.shown.map(request => renderRow(request))}{renderMore(group)}</Fragment>)
          : groups.map(group => {
            const collapsed = collapsedGroups.includes(group.key)
            const id = `${groupId}-${group.key}`
            // A212: the group's full count, never "N of M"; its Show more says there is more.
            const count = requestCount(group.count)
            const headerKey = `g:${group.key}`
            return <div key={group.key} role="rowgroup" className={styles.group} aria-label={`${group.label} Requests`}>
              <div role="row" aria-level={1} aria-expanded={!collapsed} aria-label={`${group.label}, ${count}`} tabIndex={grid.tabbable === headerKey ? 0 : -1} data-grid-row={headerKey}
                className={presentation ? `${styles.groupRow} ${styles.groupHeader}` : styles.groupRow}>
                <div role="gridcell" className={styles.groupCell}><h2 className={styles.groupHeading}><button type="button" tabIndex={-1} className={styles.groupButton} aria-expanded={!collapsed} aria-controls={id} aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.label} group`} onClick={() => grid.toggleGroup(group.key, !collapsed)}>
                  {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}<span>{group.label}</span>
                  <span className={styles.groupCount}>{count}</span>
                </button></h2></div>
                {presentation && !readOnly && group.key === "status:open" && <div role="gridcell" className={styles.groupAddCell}><Tooltip morph="plain" content={<>New Request<KeyCap className={styles.tipKey}>C</KeyCap></>}><NewRequestLink tabIndex={-1} className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.iconCircle}`} aria-label="New Request"><Plus aria-hidden="true" /></NewRequestLink></Tooltip></div>}
              </div>
              <div id={id} hidden={collapsed}>{group.shown.map(request => renderRow(request, 2))}{renderMore(group, 2)}</div>
            </div>
          })}
        </div>}
    {olderError && !errorInGroup && !workspaceEmpty && <p role="alert" className={layoutStyles.showMoreError}>{olderError.message}</p>}
    {footer}
    </div>
    </div>
    </div>
    {/* A231: the summary is the second panel beside the list on desktop and the bottom panel on a phone. */}
    {presentation && <RequestListSummary open={summaryOpen} rows={matching} filter={filter} project={project} requestType={requestType} onFilter={filterFromSummary} onClose={closeSummary} />}
    <AnimatePresence initial={false}>
    {/* One panel for the preview's life: J and K swap its content, not the panel. */}
    {shownPeek && context && viewer && <RequestPeek key="request-peek" requestId={shownPeek} serverRow={peekRow} orgId={context.orgId} isGuest={isGuest} viewer={viewer} onClose={closePeek} onOpenFullPage={openPeekFullPage} />}
    </AnimatePresence>
    </div>
    <RequestSelectionBar busy={selection.busy} count={selection.count} action={selection.action} allSelected={selection.allSelected} error={selection.error} message={selection.message} actions={selection.actions} />
  </div></RequestPeekLoadAhead></RequestPeekOpener>
}
