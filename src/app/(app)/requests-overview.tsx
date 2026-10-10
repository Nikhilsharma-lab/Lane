"use client"
// Lane Request rows composed from official Arc properties, filters and controls.
import { DataTable } from "@/components/requests/tasks/data-table"
import { columns } from "@/components/requests/tasks/columns"
import Link from "next/link"
import { Folder, Plus } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import buttonStyles from "@/components/arc/button/button.module.css"
import { NewRequestLink } from "@/components/requests/new-request-link"
import type { OverviewRequest } from "@/lib/request-overview"
import type { RequestProjectFilter, RequestStatusFilter } from "@/lib/request-workspace"
import styles from "./requests-overview.module.css"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"
import { RequestRowActions } from "@/components/requests/request-row-actions"

export function RequestsOverview({ requests, filter, projectFilter = "all", projectName, isGuest, context }: {
  requests: OverviewRequest[]
  filter: RequestStatusFilter
  projectFilter?: RequestProjectFilter
  projectName?: string
  isGuest: boolean
  context?: { orgId: string }
}) {
  const heading = projectName ?? (projectFilter === "none" ? "No Project" : isGuest ? "My Requests" : "Requests")
  return (
    <div data-slot="requests-workspace" className={styles.overview}>
      <header className={styles.titleStrip} data-slot="requests-title-strip">
        <SidebarExpandButton />
        <h1 className={styles.title} title={heading}>{heading}</h1>
        {isGuest && <p className={styles.guestHint} title="Only Requests you submit appear here.">Only Requests you submit appear here.</p>}
        {/* The one labelled way in; the sidebar glyph and the Open group's plus share its name and the C shortcut. */}
        <Tooltip content={<>New Request<kbd className={styles.kbd}>C</kbd></>} side="bottom">
          <NewRequestLink className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm} ${styles.newRequest}`}><Plus size={16} aria-hidden="true" />New Request</NewRequestLink>
        </Tooltip>
      </header>
      {context
        ? <RequestRowActions requests={requests} context={context} isGuest={isGuest}><DataTable data={requests} columns={columns} filter={filter} projectFilter={projectFilter} projectName={projectName} context={context} isGuest={isGuest} /></RequestRowActions>
        : <DataTable data={requests} columns={columns} filter={filter} projectFilter={projectFilter} projectName={projectName} context={context} isGuest={isGuest} />}
      {requests.length === 200 && <p className={styles.limitNote}>Showing the latest 200 Requests.</p>}
    </div>
  )
}

export function ProjectUnavailable() {
  return <div data-slot="requests-workspace" className="flex min-w-0 flex-1 flex-col p-6">
    <div><SidebarExpandButton /></div>
    <h1 className="sr-only">Project unavailable</h1>
    <div className="my-auto"><EmptyState icon={<Folder />} title="Project unavailable" description="This Project could not be found or is not available in this workspace." action={<Link href="/" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`}>View all Requests</Link>} /></div>
  </div>
}
