"use client"

import { useCallback, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "motion/react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { Pagination } from "@/components/arc/pagination/pagination"
import { Select } from "@/components/arc/select/select"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Button } from "@/components/arc/button/button"
import { useRequestListView } from "@/components/requests/list-view-state"
import { RequestWorkspaceKeyboard } from "@/app/(app)/request-workspace-keyboard"
import { groupRequestRows, paginateRequests, sortRequestRows, type OverviewRequest } from "@/lib/request-overview"
import { requestListHref, parseRequestStatusFilter, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { NewRequestLink } from "../new-request-link"
import { useRequestRowPresentation } from "../row-presentation"
import { RequestListSummary } from "../request-list-summary"
import { DataTableToolbar } from "./data-table-toolbar"
import { RequestRow } from "../request-row"
import { useRequestSelection } from "../use-request-selection"
import { RequestSelectionBar } from "../request-selection-bar"
import type { RequestColumn } from "./columns"
import styles from "../request-rows.module.css"
import layoutStyles from "./data-table-toolbar.module.css"

export function DataTable({ columns, data, filter, projectFilter = "all", projectName, context, isGuest = false }: { columns: RequestColumn[]; data: OverviewRequest[]; filter: RequestStatusFilter; projectFilter?: RequestProjectFilter; projectName?: string; context?: { orgId: string }; isGuest?: boolean }) {
  const router = useRouter()
  const presentation = useRequestRowPresentation()
  const [summaryOpen, setSummaryOpen] = useState(false)
  const summaryTrigger = useRef<HTMLButtonElement>(null)
  const groupId = useId()
  const [view, setView] = useRequestListView()
  const { localFilters, ordering, grouping, collapsedGroups, pagination } = view
  const columnVisibility: Record<string, boolean> = { project: projectFilter === "all", ...view.columnVisibility }
  const valueFor = (id: string) => String(localFilters.find(item => item.id === id)?.value ?? "")
  const title = valueFor("title"), project = projectFilter === "all" ? "" : projectFilter, requestType = valueFor("requestType")
  const groups = useMemo(() => {
    const query = title.trim().toLocaleLowerCase()
    const rows = data.filter(row => (filter === "all" || row.status === filter)
      && (row.reframedProblem ?? row.title).toLocaleLowerCase().includes(query)
      && (!project || (row.projectId ?? "none") === project)
      && (!requestType || (row.requestType ?? "none") === requestType))
    return groupRequestRows(sortRequestRows(rows, ordering), grouping)
  }, [data, filter, title, project, requestType, ordering, grouping])
  const matching = useMemo(() => groups.flatMap(group => group.rows), [groups])
  const { rows: currentRows, pageIndex, pageCount } = paginateRequests(matching, pagination.pageIndex, pagination.pageSize)
  const pageIds = new Set(currentRows.map(row => row.id))
  const visibleRows = grouping === "none" ? currentRows : groups.filter(group => !collapsedGroups.includes(group.key)).flatMap(group => group.rows.filter(row => pageIds.has(row.id)))
  const selectionScope = JSON.stringify([context?.orgId, isGuest, filter, projectFilter, localFilters, ordering, grouping, collapsedGroups, pagination])
  const selection = useRequestSelection(selectionScope, visibleRows, context, isGuest)
  const setFilter = (id: string, value: string) => {
    if (id === "project") {
      setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: 0 } }))
      router.replace(requestListHref(filter, value || "all"), { scroll: false })
      return
    }
    setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: 0 }, localFilters: [...previous.localFilters.filter(item => item.id !== id), ...(value ? [{ id, value }] : [])] }))
  }
  const clearFilters = () => {
    setView(previous => ({ ...previous, localFilters: [], pagination: { ...previous.pagination, pageIndex: 0 } }))
    if (filter !== "all" || projectFilter !== "all") router.replace(requestListHref("all"), { scroll: false })
  }
  const restoreRequest = useCallback((id: string) => {
    const index = matching.findIndex(row => row.id === id)
    const group = groups.find(item => item.rows.some(row => row.id === id))
    if (index >= 0) setView(previous => ({ ...previous, collapsedGroups: previous.collapsedGroups.filter(key => key !== group?.key), pagination: { ...previous.pagination, pageIndex: Math.floor(index / previous.pagination.pageSize) } }))
  }, [matching, groups, setView])
  const hasFilter = filter !== "all" || !!title || !!requestType
  const emptyTitle = hasFilter ? "No matching Requests" : projectFilter === "none" ? "No Requests without a Project" : projectFilter !== "all" ? "No Requests in this Project yet" : "No Requests yet"
  const renderRows = (rows: OverviewRequest[], label: string, id?: string) => <ul id={id} className={styles.list} aria-label={label}>
    {rows.map(request => <RequestRow key={request.id} request={request} columns={columns} visibility={columnVisibility} filter={filter} projectFilter={projectFilter} checked={selection.selected.some(row => row.id === request.id)} disabled={selection.busy} onCheckedChange={checked => selection.toggle(request.id, checked)} />)}
  </ul>
  return <div className={layoutStyles.tableLayout} data-preview-table={presentation ? "" : undefined}>
    <RequestWorkspaceKeyboard returnHref={requestListHref(filter, projectFilter)} onRestoreRequest={restoreRequest} />
    <DataTableToolbar data={data} filter={filter} title={title} project={project} projectName={projectName} requestType={requestType} columns={columns} columnVisibility={columnVisibility} ordering={ordering} grouping={grouping}
      summaryOpen={presentation ? summaryOpen : undefined} onSummaryChange={setSummaryOpen} summaryTrigger={summaryTrigger}
      onFilterChange={setFilter}
      onStatusChange={next => { setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: 0 } })); router.replace(requestListHref(next, projectFilter), { scroll: false }) }}
      onVisibilityChange={next => setView(previous => ({ ...previous, columnVisibility: { ...previous.columnVisibility, ...Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== (columnVisibility[key] !== false))) } }))}
      onOrderingChange={next => setView(previous => ({ ...previous, ordering: next, pagination: { ...previous.pagination, pageIndex: 0 } }))}
      onGroupingChange={next => setView(previous => ({ ...previous, grouping: next, collapsedGroups: [], pagination: { ...previous.pagination, pageIndex: 0 } }))}
      onClear={clearFilters} />
    <div className={layoutStyles.listAndSummary} data-summary-open={summaryOpen || undefined}>
    <div className={layoutStyles.listPane}>
    <div className={`${styles.records} ${layoutStyles.recordRegion}`}>
      {!matching.length ? <EmptyState title={emptyTitle} description={hasFilter ? "Change or clear your filters." : "Create a Request to get started."} action={hasFilter ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} />
        : grouping === "none" ? renderRows(currentRows, "Requests")
          : groups.map(group => {
            const rows = group.rows.filter(row => pageIds.has(row.id))
            if (!rows.length) return null
            const collapsed = collapsedGroups.includes(group.key)
            const id = `${groupId}-${group.key}`
            return <section key={group.key} className={styles.group} aria-label={`${group.label} Requests`}>
              <div className={presentation ? styles.groupHeader : undefined}><h2 className={styles.groupHeading}><button type="button" className={styles.groupButton} aria-expanded={!collapsed} aria-controls={id} aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.label} group`} onClick={() => setView(previous => ({ ...previous, collapsedGroups: collapsed ? previous.collapsedGroups.filter(key => key !== group.key) : [...previous.collapsedGroups, group.key] }))}>
                {collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}<span>{group.label}</span>
                <span className={styles.groupCount}>{rows.length < group.rows.length ? `${rows.length} of ` : ""}{group.rows.length} {group.rows.length === 1 ? "Request" : "Requests"}</span>
              </button></h2>{presentation && grouping === "status" && <NewRequestLink className={styles.groupAdd} aria-label={`New Request from ${group.label} group`} title="New Request starts Open"><Plus size={16} aria-hidden="true" /></NewRequestLink>}</div>
              <div id={id} hidden={collapsed}>{renderRows(rows, `${group.label} Requests`)}</div>
            </section>
          })}
    </div>
    <div className={`${styles.footer} ${layoutStyles.tableFooter}`}>
      <div className={styles.pageInfo}><Select label="Requests per page" value={String(pagination.pageSize)} options={[10, 20, 25, 30, 40, 50].map(size => ({ value: String(size), label: String(size) }))} onValueChange={value => setView(previous => ({ ...previous, pagination: { pageIndex: 0, pageSize: Number(value) } }))} />
      <p className={styles.count}>{matching.length ? pageIndex * pagination.pageSize + 1 : 0} – {Math.min((pageIndex + 1) * pagination.pageSize, matching.length)} of {matching.length} Requests</p></div>
      <Pagination page={pageIndex + 1} pageCount={pageCount} onPageChange={page => setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: page - 1 } }))} label="Request pages" />
    </div>
    </div>
    <AnimatePresence initial={false}>
    {presentation && summaryOpen && <RequestListSummary rows={matching} filter={filter} project={project} requestType={requestType}
      onFilter={(field, value) => { if (field === "status") { setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: 0 } })); router.replace(requestListHref(parseRequestStatusFilter(value), projectFilter), { scroll: false }) } else setFilter(field, value) }}
      onClose={() => { setSummaryOpen(false); summaryTrigger.current?.focus() }} />}
    </AnimatePresence>
    </div>
    <RequestSelectionBar selection={selection} />
  </div>
}
