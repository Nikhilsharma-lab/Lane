"use client"

import { useRef, type RefObject } from "react"
import { SearchField } from "@/components/arc/search-field/search-field"
import { FilterMenu, FilterToolbar, type FilterChip } from "@/components/arc/filter-toolbar/filter-toolbar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { ChipGroup } from "@/components/arc/chip-group/chip-group"
import { Select } from "@/components/arc/select/select"
import { Button } from "@/components/arc/button/button"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider"
import { ListFilter, PanelRight, Search, SlidersHorizontal } from "lucide-react"
import { REQUEST_TYPES, REQUEST_TYPE_LABELS } from "@/lib/request-properties"
import { isRequestStatusFilter } from "@/lib/request-workspace"
import type { OverviewRequest, RequestGrouping, RequestOrdering } from "@/lib/request-overview"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import type { RequestColumn } from "./columns"
import { statuses } from "./statuses"
import rowStyles from "../request-rows.module.css"
import styles from "./data-table-toolbar.module.css"

const statusViews = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

export function DataTableToolbar({ data, filter, title, project, projectName, requestType, columns, columnVisibility, ordering, grouping, onOrderingChange, onGroupingChange, onFilterChange, onStatusChange, onVisibilityChange, onClear, summaryOpen, onSummaryChange, summaryTrigger }: {
  summaryOpen?: boolean; onSummaryChange?: (open: boolean) => void; summaryTrigger?: RefObject<HTMLButtonElement | null>;
  data: OverviewRequest[]; filter: RequestStatusFilter; title: string; project: string; projectName?: string; requestType: string; columns: RequestColumn[]; columnVisibility: Record<string, boolean>;
  ordering: RequestOrdering; grouping: RequestGrouping; onOrderingChange: (value: RequestOrdering) => void; onGroupingChange: (value: RequestGrouping) => void;
  onFilterChange: (id: string, value: string) => void; onStatusChange: (value: RequestStatusFilter) => void; onVisibilityChange: (value: Record<string, boolean>) => void; onClear: () => void
}) {
  const titleInput = useRef<HTMLInputElement>(null)
  const preview = summaryOpen !== undefined
  const sharedProjects = useSharedWorkspaceProjects()
  const projectEntries = sharedProjects
    ? sharedProjects.projects.map(item => [item.id, item.name] as const)
    : data.filter(row => row.projectId).map(row => [row.projectId!, row.projectName ?? "Unavailable Project"] as const)
  const projectsById = new Map(projectEntries)
  if (project && project !== "none" && projectName) projectsById.set(project, projectName)
  const projects = Array.from(projectsById.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  // Arc FilterMenu returns the displayed option label. Keep the sentinel
  // distinguishable from valid user-created Projects without renaming them.
  const projectNames = new Set(projects.map(([, name]) => name))
  let noProjectLabel = projectNames.has("No Project") ? "Requests without a Project" : "No Project"
  while (projectNames.has(noProjectLabel)) noProjectLabel += " (unassigned)"
  const fields = [
    { id: "status", label: "Status", options: statuses.map(item => ({ value: item.value, label: item.label, hint: summaryOpen !== undefined ? data.filter(row => row.status === item.value).length : undefined, icon: summaryOpen !== undefined ? <item.icon size={16} aria-hidden="true" /> : undefined })) },
    { id: "project", label: "Project", options: [{ value: "none", label: noProjectLabel }, ...projects.map(([value, label]) => ({ value, label, hint: summaryOpen !== undefined ? data.filter(row => row.projectId === value).length : undefined }))] },
    { id: "requestType", label: "Request type", options: [{ value: "none", label: "No type" }, ...REQUEST_TYPES.map(value => ({ value, label: REQUEST_TYPE_LABELS[value] }))] },
  ]
  const chips: FilterChip[] = fields.flatMap(field => { const value = field.id === "status" ? filter === "all" ? "" : filter : field.id === "project" ? project : requestType; return value ? [{ id: field.id, label: field.label, value: field.options.find(option => option.value === value)?.label ?? value }] : [] })
  const displayedChips: FilterChip[] = [...(title ? [{ id: "title", label: "Title", value: title }] : []), ...chips]
  const addFilter = (chip: FilterChip) => {
    const field = fields.find(item => item.id === chip.id)
    const value = field?.options.find(option => option.label === chip.value)?.value ?? ""
    if (chip.id === "status") onStatusChange(value as RequestStatusFilter)
    else onFilterChange(chip.id, value)
  }
  return <div className={styles.toolbarStack}>
    <div data-slot="requests-toolbar" className={styles.toolbar}>
      {preview ? <div className={styles.status}><ChipGroup label="Request status" options={statusViews} value={[filter]} multiple={false} onValueChange={values => {
        const next = values[0] ?? "all"
        if (isRequestStatusFilter(next) && next !== filter) onStatusChange(next)
      }} /></div> : <SegmentedControl className={styles.status} label="Request status" options={statusViews} value={filter} onValueChange={next => {
        if (isRequestStatusFilter(next) && next !== filter) onStatusChange(next)
      }} />}
      <div className={styles.actions}>
        <Popover>
          <PopoverTrigger asChild><Button variant="secondary" size="sm" className={styles.iconButton} data-active={title ? "" : undefined} aria-label="Filter Requests by title" title="Filter Requests by title"><Search size={preview ? 14 : 17} aria-hidden="true" /></Button></PopoverTrigger>
          <PopoverContent align="end" aria-label="Filter Requests by title" className={styles.searchPanel} onOpenAutoFocus={event => { event.preventDefault(); titleInput.current?.focus() }}>
            <SearchField ref={titleInput} label="Search Requests" aria-label="Filter Requests by title" placeholder="Filter by title…" value={title} onValueChange={value => onFilterChange("title", value)} />
          </PopoverContent>
        </Popover>
        <FilterMenu presentation="popover" fields={fields} active={chips} onSelect={addFilter} triggerIcon={<ListFilter size={preview ? 14 : 17} aria-hidden="true" />} />
        <Popover><PopoverTrigger asChild><Button variant="secondary" size="sm" className={styles.iconButton} aria-label="Display" title="Display"><SlidersHorizontal size={preview ? 14 : 17} aria-hidden="true" /></Button></PopoverTrigger><PopoverContent align="end" aria-label="Display Requests">
          <div className={rowStyles.displayPanel}>
            <Select label="Group by" value={grouping} onValueChange={value => onGroupingChange(value as RequestGrouping)} options={[{ value: "none", label: "No grouping" }, { value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "owner", label: "Owner" }]} />
            <Select label="Order by" value={ordering} onValueChange={value => onOrderingChange(value as RequestOrdering)} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "title", label: "Title A–Z" }, { value: "title_desc", label: "Title Z–A" }, { value: "status", label: "Status" }]} />
            <div><p className={rowStyles.displayLabel}>Properties</p><ChipGroup label="Visible properties" options={columns.filter(item => item.key !== "title").map(item => ({ value: item.key, label: item.label }))} value={columns.filter(item => item.key !== "title" && columnVisibility[item.key] !== false).map(item => item.key)} onValueChange={next => onVisibilityChange(Object.fromEntries(columns.map(item => [item.key, item.key === "title" || next.includes(item.key)])))} /></div>
          </div>
        </PopoverContent></Popover>
        {summaryOpen !== undefined && <Button ref={summaryTrigger} variant="secondary" size="sm" className={styles.iconButton} data-active={summaryOpen || undefined} aria-label={summaryOpen ? "Close list summary" : "Open list summary"} aria-expanded={summaryOpen} onClick={() => onSummaryChange?.(!summaryOpen)}><PanelRight size={preview ? 14 : 17} aria-hidden="true" /></Button>}
      </div>
    </div>
    {displayedChips.length > 0 && <div className={styles.activeFilters}><FilterToolbar filters={displayedChips} onRemove={id => id === "status" ? onStatusChange("all") : onFilterChange(id, "")} onClearAll={onClear} /></div>}
  </div>
}
