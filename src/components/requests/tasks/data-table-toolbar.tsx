"use client"

import { useRef, type RefObject } from "react"
import { SearchField } from "@/components/arc/search-field/search-field"
import { FilterMenu, FilterToolbar, type FilterChip } from "@/components/arc/filter-toolbar/filter-toolbar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { ChipGroup } from "@/components/arc/chip-group/chip-group"
import { Select } from "@/components/arc/select/select"
import { Button } from "@/components/arc/button/button"
import { CalendarClock, Funnel, Hourglass, ListFilter, PanelRight, SlidersHorizontal } from "lucide-react"
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider"
import { ProjectMarker } from "@/components/projects/project-marker"
import { useWorkspaceLabels } from "../workspace-labels"
import { addedFilters } from "../list-empty-state"
import { LabelDot } from "../request-labels"
import { REQUEST_STATUS_FILTER_LABELS } from "@/lib/request-workspace"
import { REQUEST_TITLE_FILTER_MAX } from "@/lib/saved-view-rules"
import { matchesStatusView, type OverviewRequest, type RequestGrouping, type RequestOrdering } from "@/lib/request-overview"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import type { RequestColumn } from "./columns"
import { statuses } from "./statuses"
import rowStyles from "../request-rows.module.css"
import styles from "./data-table-toolbar.module.css"
import { StatusPills } from "./status-pills"
import { matchCountText } from "../request-row-label"

// A214: a funnel, as a magnifier means workspace search. list-focus.ts finds the button by this name.
const TITLE_FILTER_LABEL = "Filter by title"

export function DataTableToolbar({ controls = true, data, filter, title, project, projectAdded, requestType, matchCount, columns, columnVisibility, ordering, grouping, onOrderingChange, onGroupingChange, onFilterChange, onStatusChange, onVisibilityChange, onClear, summaryOpen, onSummaryChange, summaryTrigger }: {
  /** False in an empty workspace (plan item 2.1): the row keeps its height with nothing to filter, so the first Request's controls fill it without moving the list. */
  controls?: boolean;
  summaryOpen?: boolean; onSummaryChange?: (open: boolean) => void; summaryTrigger?: RefObject<HTMLButtonElement | null>;
  data: OverviewRequest[]; filter: RequestStatusFilter; title: string; project: string; projectAdded?: boolean; requestType: string; matchCount: number; columns: RequestColumn[]; columnVisibility: Record<string, boolean>;
  ordering: RequestOrdering; grouping: RequestGrouping; onOrderingChange: (value: RequestOrdering) => void; onGroupingChange: (value: RequestGrouping) => void;
  onFilterChange: (id: string, value: string) => void; onStatusChange: (value: RequestStatusFilter) => void; onVisibilityChange: (value: Record<string, boolean>) => void; onClear: () => void
}) {
  const { labels } = useWorkspaceLabels()
  const requestTypeOptions = [{ value: "none", label: "No labels", icon: <span /> }, ...labels.map(label => ({ value: label.id, label: label.name, icon: <LabelDot colour={label.colour} /> }))]
  const titleInput = useRef<HTMLInputElement>(null)
  // A215: on the whole list Add filter offers the Projects too; a Project page's Project is the page, so it offers none there.
  const projects = [...useSharedWorkspaceProjects().projects].sort((a, b) => a.name.localeCompare(b.name))
  // Arc FilterMenu returns the option's label, so "No Project" must not be a Project's own name.
  let noProject = "No Project"
  while (projects.some(item => item.name === noProject)) noProject = noProject === "No Project" ? "Requests without a Project" : `${noProject} (unassigned)`
  // #133: the five journey statuses and Due soon or overdue, counted the way the list filters them.
  const now = new Date()
  const statusHint = (view: RequestStatusFilter) => summaryOpen !== undefined ? data.filter(row => matchesStatusView(row, view, now)).length : undefined
  const fields = [
    { id: "status", label: "Status", options: [
      ...statuses.map(item => ({ value: item.value, label: item.label, hint: statusHint(item.value), icon: <item.icon aria-hidden="true" /> })),
      { value: "due", label: REQUEST_STATUS_FILTER_LABELS.due, hint: statusHint("due"), icon: <CalendarClock aria-hidden="true" /> },
      // Review of #195: Guest submissions waiting to be taken on, so none are forgotten (a saved view keeps it).
      { value: "waiting", label: REQUEST_STATUS_FILTER_LABELS.waiting, hint: statusHint("waiting"), icon: <Hourglass aria-hidden="true" /> },
    ] },
    ...project === "all" || projectAdded ? [{ id: "project", label: "Project", options: [{ value: "none", label: noProject, icon: <ProjectMarker projectId={null} /> },
      ...projects.map(item => ({ value: item.id, label: item.name, icon: <ProjectMarker projectId={item.id} />, hint: summaryOpen !== undefined ? data.filter(row => row.projectId === item.id).length : undefined }))] }] : [],
    { id: "requestType", label: "Labels", options: requestTypeOptions },
  ]
  const values: Record<string, string> = { status: filter === "all" ? "" : filter, project: project === "all" ? "" : project, requestType, title }
  const chipOf = (id: string): FilterChip => { const field = fields.find(item => item.id === id); return { id, label: field?.label ?? "Title", value: field?.options.find(option => option.value === values[id])?.label ?? values[id] } }
  // The Add filter menu marks each field's current value, the status pill's included.
  const active = fields.filter(field => values[field.id]).map(field => chipOf(field.id))
  // #240 decision 10 (A215): chips, and the match bar, only for filters the person added (list-empty-state.ts).
  const displayedChips = addedFilters({ title, project, projectAdded, requestType }).map(chipOf)
  const addFilter = (chip: FilterChip) => {
    const field = fields.find(item => item.id === chip.id)
    const value = field?.options.find(option => option.label === chip.value)?.value ?? ""
    if (chip.id === "status") onStatusChange(value as RequestStatusFilter)
    else onFilterChange(chip.id, value)
  }
  if (!controls) return <div className={styles.toolbarStack}><div data-slot="requests-toolbar" className={styles.toolbar} /></div>
  return <div className={styles.toolbarStack}>
    <div data-slot="requests-toolbar" className={styles.toolbar}>
      <div className={styles.status}><StatusPills filter={filter} onStatusChange={onStatusChange} /></div>
      <div className={styles.actions}>
        <Popover>
          <PopoverTrigger asChild><Button variant="secondary" size="sm" className={styles.iconButton} data-active={title ? "" : undefined} data-title-filter="" aria-label={TITLE_FILTER_LABEL} title={TITLE_FILTER_LABEL}><Funnel aria-hidden="true" /></Button></PopoverTrigger>
          <PopoverContent align="end" aria-label={TITLE_FILTER_LABEL} className={styles.searchPanel} onOpenAutoFocus={event => { event.preventDefault(); titleInput.current?.focus() }}>
            <SearchField ref={titleInput} label={TITLE_FILTER_LABEL} icon={<Funnel data-icon-size="lg" aria-hidden="true" />} placeholder="Filter by title…" value={title} maxLength={REQUEST_TITLE_FILTER_MAX} onValueChange={value => onFilterChange("title", value)} />
          </PopoverContent>
        </Popover>
        <FilterMenu presentation="popover" fields={fields} active={active} onSelect={addFilter} triggerIcon={<ListFilter aria-hidden="true" />} />
        <Popover><PopoverTrigger asChild><Button variant="secondary" size="sm" className={styles.iconButton} aria-label="Display" title="Display"><SlidersHorizontal aria-hidden="true" /></Button></PopoverTrigger><PopoverContent align="end" aria-label="Display Requests">
          <div className={rowStyles.displayPanel}>
            <Select label="Group by" value={grouping} onValueChange={value => onGroupingChange(value as RequestGrouping)} options={[{ value: "none", label: "No grouping" }, { value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "assignee", label: "Assignee" }]} />
            <Select label="Order by" value={ordering} onValueChange={value => onOrderingChange(value as RequestOrdering)} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "title", label: "Title A–Z" }, { value: "title_desc", label: "Title Z–A" }, { value: "status", label: "Status" }]} />
            <div><p className={rowStyles.displayLabel}>Properties</p><ChipGroup label="Visible properties" options={columns.filter(item => item.key !== "title").map(item => ({ value: item.key, label: item.label }))} value={columns.filter(item => item.key !== "title" && columnVisibility[item.key] !== false).map(item => item.key)} onValueChange={next => onVisibilityChange(Object.fromEntries(columns.map(item => [item.key, item.key === "title" || next.includes(item.key)])))} /></div>
          </div>
        </PopoverContent></Popover>
        {summaryOpen !== undefined && <Button ref={summaryTrigger} variant="secondary" size="sm" className={styles.iconButton} data-active={summaryOpen || undefined} aria-label={summaryOpen ? "Close list summary" : "Open list summary"} aria-expanded={summaryOpen} onClick={() => onSummaryChange?.(!summaryOpen)}><PanelRight aria-hidden="true" /></Button>}
      </div>
    </div>
    {/* Plan item 2.4: the list announces chip changes and the count in its one region, debounced, so neither speaks here. */}
    {displayedChips.length > 0 && <div className={styles.activeFilters}><FilterToolbar announce={false} filters={displayedChips} onRemove={id => onFilterChange(id, "")} onClearAll={onClear}>
      {/* Counts every matching row while a filter is added. */}
      <span className={styles.matchCount}>{matchCountText(matchCount)}</span>
    </FilterToolbar></div>}
  </div>
}
