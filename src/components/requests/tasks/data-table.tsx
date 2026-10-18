"use client"

import { memo, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
import { AnimatePresence } from "motion/react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { Pagination } from "@/components/arc/pagination/pagination"
import { Select } from "@/components/arc/select/select"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { useRequestListUrlSync, useRequestListView, useSetDetailSession, withEmptyWorkspaceStatus, withListContext, type SetListView } from "@/components/requests/list-view-state"
import { usePendingMutations } from "@/components/requests/pending-mutations-provider"
import { RequestWorkspaceKeyboard } from "@/app/(app)/request-workspace-keyboard"
import { groupRequestRows, matchesListFilters, paginateRequests, sortRequestRows, type OverviewRequest } from "@/lib/request-overview"
import { requestListHref, parseRequestStatusFilter, type RequestStatusFilter } from "@/lib/request-workspace"
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
import { gridKeysFor } from "../request-grid-keys"
import { isShown, requestRowSelector } from "../list-focus"
import { captureSequence } from "../request-sequence"
import type { RequestColumn } from "./columns"
import styles from "../request-rows.module.css"
import layoutStyles from "./data-table-toolbar.module.css"
import buttonStyles from "@/components/arc/button/button.module.css"

// Plan item 2.4: the roving tab stop lives in DataTable, so a J, K or arrow
// re-renders it. These parts take stable props and skip that render; only the
// two rows whose tab stop moved re-render (RequestRow is memoised too).
const DataTableToolbar = memo(Toolbar)
const RequestListSummary = memo(ListSummary)
const PAGE_SIZES = [10, 20, 25, 30, 40, 50].map(size => ({ value: String(size), label: String(size) }))

const ListFooter = memo(function ListFooter({ pageIndex, pageCount, pageSize, total, setView }: { pageIndex: number; pageCount: number; pageSize: number; total: number; setView: SetListView }) {
  return <div className={`${styles.footer} ${layoutStyles.tableFooter}`}>
    <div className={styles.pageInfo}><Select label="Requests per page" value={String(pageSize)} options={PAGE_SIZES} onValueChange={value => setView(previous => ({ ...previous, pagination: { pageIndex: 0, pageSize: Number(value) } }))} />
    <p className={styles.count}>{total ? pageIndex * pageSize + 1 : 0} – {Math.min((pageIndex + 1) * pageSize, total)} of {total} Requests</p></div>
    <Pagination page={pageIndex + 1} pageCount={pageCount} onPageChange={page => setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: page - 1 } }))} label="Request pages" />
  </div>
})

/**
 * Plan item 1.7: the status view and Project filter come from the layout's
 * list view state, not from server props, so switching either (and group,
 * sort and the in-list filter) re-renders here with no network request. The
 * "/" URL mirrors that state through useRequestListUrlSync.
 */
export function DataTable({ columns, data: serverRows, projectName, context, isGuest = false, footer, welcome }: { columns: RequestColumn[]; data: OverviewRequest[]; projectName?: string; context?: { orgId: string }; isGuest?: boolean; footer?: ReactNode;
  /** Plan item 2.1: shown in the records region while the workspace has no Requests at all. */
  welcome?: ReactNode }) {
  const presentation = useRequestRowPresentation()
  const layoutRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const summaryTrigger = useRef<HTMLButtonElement>(null)
  const groupId = useId()
  const [view, setView] = useRequestListView()
  const { localFilters, ordering, grouping, collapsedGroups, pagination, status: filter, project: projectFilter } = view
  // Plan item 1.5: pending lifecycle and priority moves apply before grouping
  // and sorting, so an optimistic change regroups the row in the next frame.
  const pendingMutations = usePendingMutations()
  const data = useMemo(() => pendingMutations?.apply(serverRows) ?? serverRows, [pendingMutations, serverRows])
  useRequestListUrlSync(view, setView, (pendingMutations?.unconfirmed ?? 0) > 0)
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
  const valueFor = (id: string) => String(localFilters.find(item => item.id === id)?.value ?? "")
  const title = valueFor("title"), project = projectFilter === "all" ? "" : projectFilter, requestType = valueFor("requestType")
  const groups = useMemo(() => {
    // The composer's hidden-by-filters toast reads the same function (plan item 2.3).
    const filters = { status: filter, project: projectFilter, title, requestType }
    const rows = data.filter(row => matchesListFilters(row, filters))
    return groupRequestRows(sortRequestRows(rows, ordering), grouping)
  }, [data, filter, title, projectFilter, requestType, ordering, grouping])
  const matching = useMemo(() => groups.flatMap(group => group.rows), [groups])
  const { rows: currentRows, pageIndex, pageCount } = useMemo(() => paginateRequests(matching, pagination.pageIndex, pagination.pageSize), [matching, pagination.pageIndex, pagination.pageSize])
  const pageIds = new Set(currentRows.map(row => row.id))
  const visibleRows = grouping === "none" ? currentRows : groups.filter(group => !collapsedGroups.includes(group.key)).flatMap(group => group.rows.filter(row => pageIds.has(row.id)))
  const selectionScope = JSON.stringify([context?.orgId, isGuest, filter, projectFilter, localFilters, ordering, grouping, collapsedGroups, pagination])
  const selection = useRequestSelection(selectionScope, visibleRows, context, isGuest)
  const announce = useListAnnouncer()
  // Plan item 2.4 (decision 8.24): the list is a treegrid when grouped and a
  // grid when not, with the row as its one tab stop (use-request-grid.ts).
  const grouped = grouping !== "none"
  const gridKeys = useMemo(() => gridKeysFor(grouped ? groups : null, currentRows, collapsedGroups), [grouped, groups, currentRows, collapsedGroups])
  const rowGroups = useMemo(() => new Map<string, string>(groups.flatMap(group => group.rows.map(row => [`r:${row.id}`, group.key] as const))), [groups])
  const grid = useRequestGrid({
    gridRef, scopeRef: layoutRef, keys: gridKeys,
    keysForPage: index => gridKeysFor(grouped ? groups : null, paginateRequests(matching, index, pagination.pageSize).rows, collapsedGroups),
    groupOf: key => grouped ? rowGroups.get(key) ?? null : null,
    isCollapsed: group => collapsedGroups.includes(group),
    setCollapsed: (group, collapse) => setView(previous => ({ ...previous, collapsedGroups: collapse ? [...previous.collapsedGroups.filter(key => key !== group), group] : previous.collapsedGroups.filter(key => key !== group) })),
    toggleSelected: id => selection.toggle(id, !selection.selected.some(row => row.id === id)),
    page: { index: pageIndex, count: pageCount, go: index => setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: index } })) },
    // A page crossing drops the selection; the same message says so.
    announce: text => announce(selection.withDropNotice(text), { key: "page" }),
  })
  const setGridActive = grid.setActive
  // Plan item 2.5: opening a Request from the list records the order it shows,
  // across every page, so detail can offer previous and next. The row menu's
  // "Open Request" and Enter both click the title link, so one capture covers all three.
  const setDetailSession = useSetDetailSession()
  const captureOpen = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target instanceof Element ? event.target.closest("a[data-request-title]") : null
    const openedId = link?.closest<HTMLElement>("[data-request-id]")?.dataset.requestId
    if (!openedId) return
    setDetailSession({ sequence: captureSequence(matching.map(row => row.id), openedId), focusTitleOnArrival: true })
  }, [matching, setDetailSession])
  const setFilter = useCallback((id: string, value: string) => {
    if (id === "project") {
      setView(previous => withListContext(previous, { project: value || "all" }))
      return
    }
    setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: 0 }, localFilters: [...previous.localFilters.filter(item => item.id !== id), ...(value ? [{ id, value }] : [])] }))
  }, [setView])
  const clearFilters = useCallback(() => {
    setView(previous => ({ ...withListContext(previous, { status: "all", project: "all" }), localFilters: [], pagination: { ...previous.pagination, pageIndex: 0 } }))
  }, [setView])
  const setStatus = useCallback((next: RequestStatusFilter) => setView(previous => withListContext(previous, { status: next })), [setView])
  const setVisibility = useCallback((next: Record<string, boolean>) => setView(previous => ({ ...previous, columnVisibility: { ...previous.columnVisibility, ...Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== (columnVisibility[key] !== false))) } })), [setView, columnVisibility])
  const setOrdering = useCallback((next: typeof ordering) => setView(previous => ({ ...previous, ordering: next, pagination: { ...previous.pagination, pageIndex: 0 } })), [setView])
  const setGrouping = useCallback((next: typeof grouping) => setView(previous => ({ ...previous, grouping: next, collapsedGroups: [], pagination: { ...previous.pagination, pageIndex: 0 } })), [setView])
  const filterFromSummary = useCallback((field: string, value: string) => {
    if (field === "status") setView(previous => withListContext(previous, { status: parseRequestStatusFilter(value) }))
    else setFilter(field, value)
  }, [setView, setFilter])
  const closeSummary = useCallback(() => { setSummaryOpen(false); summaryTrigger.current?.focus() }, [])
  const restoreRequest = useCallback((id: string) => {
    const index = matching.findIndex(row => row.id === id)
    const group = groups.find(item => item.rows.some(row => row.id === id))
    if (index >= 0) setView(previous => ({ ...previous, collapsedGroups: previous.collapsedGroups.filter(key => key !== group?.key), pagination: { ...previous.pagination, pageIndex: Math.floor(index / previous.pagination.pageSize) } }))
    // The returning row also takes the grid's tab stop.
    if (index >= 0) setGridActive(`r:${id}`)
  }, [matching, groups, setView, setGridActive])
  // Plan item 2.3: "Show it" on the composer's toast moved the view to one that
  // holds the new Request. Bring its group and page into view, focus it, and
  // clear the request, as the return-focus marker does.
  const reveal = view.reveal
  const revealRow = useEffectEvent((id: string) => restoreRequest(id))
  useEffect(() => {
    if (!reveal) return
    revealRow(reveal)
    let frame = 0, attempts = 0
    const done = () => setView(previous => previous.reveal === reveal ? { ...previous, reveal: undefined } : previous)
    const focusRow = () => {
      // Plan item 2.4: the row, the list's one tab stop, not its title link.
      const row = document.querySelector(requestRowSelector(reveal))
      if (isShown(row)) {
        row.focus({ preventScroll: true })
        row.scrollIntoView({ block: "nearest" })
        if (document.activeElement === row) return done()
      }
      if (++attempts < 20) frame = window.requestAnimationFrame(focusRow)
      else done()
    }
    frame = window.requestAnimationFrame(focusRow)
    return () => window.cancelAnimationFrame(frame)
  }, [reveal, setView])
  // Plan item 2.4 (decision 8.11): while a filter is on, the result count is
  // announced once the person stops changing filters; removing the last one
  // says so. A count that changes only because the data did is not announced,
  // and nothing is said on the first render.
  const filterSignature = JSON.stringify([filter, projectFilter, title, requestType])
  const announcedFilters = useRef(filterSignature)
  const matchCount = matching.length
  useEffect(() => {
    if (announcedFilters.current === filterSignature) return
    announcedFilters.current = filterSignature
    if (workspaceEmpty) return
    if (filter !== "all" || projectFilter !== "all" || title || requestType) announce(`${matchCountText(matchCount)}.`, { key: "count", delay: 600 })
    else announce("Filters cleared.", { key: "count" })
  }, [announce, filter, filterSignature, matchCount, projectFilter, requestType, title, workspaceEmpty])
  const hasFilter = filter !== "all" || !!title || !!requestType
  const emptyTitle = hasFilter ? "No matching Requests" : projectFilter === "none" ? "No Requests without a Project" : projectFilter !== "all" ? "No Requests in this Project yet" : "No Requests yet"
  const gridLabel = projectName ? `${projectName} Requests` : projectFilter === "none" ? "Requests without a Project" : isGuest ? "My Requests" : "Requests"
  const renderRow = (request: OverviewRequest, level?: number) => <RequestRow key={request.id} request={request} columns={columns} visibility={columnVisibility} filter={filter} projectFilter={projectFilter} level={level}
    tabbable={grid.tabbable === `r:${request.id}`} checked={selection.selected.some(row => row.id === request.id)} disabled={selection.busy} onCheckedChange={checked => selection.toggle(request.id, checked)} />
  return <div ref={layoutRef} className={layoutStyles.tableLayout} data-preview-table={presentation ? "" : undefined}>
    <RequestWorkspaceKeyboard returnHref={requestListHref(filter, projectFilter)} onRestoreRequest={restoreRequest} />
    <DataTableToolbar controls={!workspaceEmpty} data={data} filter={filter} title={title} project={project} projectName={projectName} requestType={requestType} matchCount={matching.length} columns={columns} columnVisibility={columnVisibility} ordering={ordering} grouping={grouping}
      summaryOpen={presentation ? summaryOpen : undefined} onSummaryChange={setSummaryOpen} summaryTrigger={summaryTrigger}
      onFilterChange={setFilter} onStatusChange={setStatus} onVisibilityChange={setVisibility} onOrderingChange={setOrdering} onGroupingChange={setGrouping} onClear={clearFilters} />
    <div className={layoutStyles.listAndSummary} data-summary-open={summaryOpen || undefined}>
    <div className={layoutStyles.listPane} data-empty-workspace={workspaceEmpty || undefined}>
    <div className={`${styles.records} ${layoutStyles.recordRegion}`}>
      {workspaceEmpty ? welcome : !matching.length ? <EmptyState title={emptyTitle} description={hasFilter ? "Change or clear your filters." : "Create a Request to get started."} action={hasFilter ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} />
        : <div ref={gridRef} role={grouped ? "treegrid" : "grid"} aria-label={gridLabel} aria-multiselectable="true" className={styles.list} data-request-grid="" {...grid.gridProps} onClickCapture={captureOpen}>
          {!grouped ? currentRows.map(request => renderRow(request))
          : groups.map(group => {
            const rows = group.rows.filter(row => pageIds.has(row.id))
            if (!rows.length) return null
            const collapsed = collapsedGroups.includes(group.key)
            const id = `${groupId}-${group.key}`
            const count = `${rows.length < group.rows.length ? `${rows.length} of ` : ""}${requestCount(group.rows.length)}`
            const headerKey = `g:${group.key}`
            return <div key={group.key} role="rowgroup" className={styles.group} aria-label={`${group.label} Requests`}>
              <div role="row" aria-level={1} aria-expanded={!collapsed} aria-label={`${group.label}, ${count}`} tabIndex={grid.tabbable === headerKey ? 0 : -1} data-grid-row={headerKey}
                className={presentation ? `${styles.groupRow} ${styles.groupHeader}` : styles.groupRow}>
                <div role="gridcell" className={styles.groupCell}><h2 className={styles.groupHeading}><button type="button" tabIndex={-1} className={styles.groupButton} aria-expanded={!collapsed} aria-controls={id} aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.label} group`} onClick={() => grid.toggleGroup(group.key, !collapsed)}>
                  {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}<span>{group.label}</span>
                  <span className={styles.groupCount}>{count}</span>
                </button></h2></div>
                {presentation && group.key === "status:open" && <div role="gridcell" className={styles.groupAddCell}><Tooltip morph="plain" content="New Request"><NewRequestLink tabIndex={-1} className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.iconCircle}`} aria-label="New Request"><Plus aria-hidden="true" /></NewRequestLink></Tooltip></div>}
              </div>
              <div id={id} hidden={collapsed}>{rows.map(request => renderRow(request, 2))}</div>
            </div>
          })}
        </div>}
    {footer}
    </div>
    {pageCount > 1 && <ListFooter pageIndex={pageIndex} pageCount={pageCount} pageSize={pagination.pageSize} total={matching.length} setView={setView} />}
    </div>
    <AnimatePresence initial={false}>
    {presentation && summaryOpen && <RequestListSummary rows={matching} filter={filter} project={project} requestType={requestType} onFilter={filterFromSummary} onClose={closeSummary} />}
    </AnimatePresence>
    </div>
    <RequestSelectionBar busy={selection.busy} count={selection.count} action={selection.action} allSelected={selection.allSelected} error={selection.error} message={selection.message} actions={selection.actions} />
  </div>
}
