"use client"
// Lane Request rows composed from official Arc properties, filters and controls.
import { useMemo, useState } from "react"
import { DataTable } from "@/components/requests/tasks/data-table"
import { columns } from "@/components/requests/tasks/columns"
import { Folder, Plus } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button } from "@/components/arc/button/button"
import buttonStyles from "@/components/arc/button/button.module.css"
import { NewRequestLink } from "@/components/requests/new-request-link"
import { useRequestListContext, useSetRequestListView, withListContext } from "@/components/requests/list-view-state"
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider"
import type { OverviewRequest } from "@/lib/request-overview"
import type { RequestProjectFilter, RequestStatusFilter } from "@/lib/request-workspace"
import styles from "./requests-overview.module.css"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"
import { RequestRowActions } from "@/components/requests/request-row-actions"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Reads older Done Requests through the GET route (plan items 1.7 and 1.16), never a server action. */
async function fetchOlderDone(orgId: string, beforeId: string): Promise<{ rows: OverviewRequest[]; hasOlderDone: boolean }> {
  const response = await fetch(`/api/requests/done?${new URLSearchParams({ org: orgId, before: beforeId })}`, { headers: { Accept: "application/json" } })
  const body = await response.json().catch(() => null) as { rows?: OverviewRequest[]; hasOlderDone?: boolean; error?: string } | null
  if (!response.ok || !body?.rows) throw new Error(body?.error ?? "Older Done Requests could not be loaded. Try again.")
  return { rows: body.rows, hasOlderDone: Boolean(body.hasOlderDone) }
}

export function RequestsOverview({ requests, isGuest, context, activeCapped = false, hasOlderDone = false }: {
  requests: OverviewRequest[]
  isGuest: boolean
  context?: { orgId: string }
  /** More Open and In Progress Requests exist than the list loads. */
  activeCapped?: boolean
  /** Done Requests older than the loaded ones exist on the server. */
  hasOlderDone?: boolean
  /** No longer read: the status view comes from the layout's list view state (plan item 1.7). Kept so fixtures type-check. */
  filter?: RequestStatusFilter
  /** No longer read, as `filter`. */
  projectFilter?: RequestProjectFilter
  /** No longer read: the name comes from the workspace's Projects. */
  projectName?: string
}) {
  const listContext = useRequestListContext()
  const status = listContext?.status ?? "all", project = listContext?.project ?? "all"
  const sharedProjects = useSharedWorkspaceProjects()
  const [older, setOlder] = useState<{ rows: OverviewRequest[]; hasMore: boolean; pending: boolean; error: string | null }>({ rows: [], hasMore: true, pending: false, error: null })
  // Server rows win over older pages, so a revalidated row is never shown twice.
  const rows = useMemo(() => {
    if (!older.rows.length) return requests
    const ids = new Set(requests.map(row => row.id))
    return [...requests, ...older.rows.filter(row => !ids.has(row.id))]
  }, [requests, older.rows])

  const projectName = project === "all" || project === "none" ? undefined
    : sharedProjects?.projects.find(item => item.id === project)?.name ?? rows.find(row => row.projectId === project)?.projectName ?? undefined
  // A Project id that is malformed or not in this workspace's Projects never
  // falls back to all Requests. Without the Projects provider (fixtures), a
  // Project counts as available when a loaded Request names it.
  const projectUnavailable = project !== "all" && project !== "none" && (!UUID_RE.test(project)
    || (sharedProjects ? !sharedProjects.projects.some(item => item.id === project) : !rows.some(row => row.projectId === project)))
  if (projectUnavailable) return <ProjectUnavailable />

  const heading = projectName ?? (project === "none" ? "No Project" : isGuest ? "My Requests" : "Requests")
  const showOlder = context && hasOlderDone && older.hasMore && (status === "all" || status === "done")
  async function showOlderDone() {
    const oldest = rows.filter(row => row.status === "done").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]
    if (!context || !oldest || older.pending) return
    setOlder(current => ({ ...current, pending: true, error: null }))
    try {
      const page = await fetchOlderDone(context.orgId, oldest.id)
      setOlder(current => ({ rows: [...current.rows, ...page.rows], hasMore: page.hasOlderDone, pending: false, error: null }))
    } catch (error) {
      setOlder(current => ({ ...current, pending: false, error: error instanceof Error ? error.message : "Older Done Requests could not be loaded. Try again." }))
    }
  }
  const footer = (activeCapped || showOlder) ? <div className={`${styles.limitNote} flex flex-wrap items-center gap-3 pt-4`}>
    {activeCapped && <p className="m-0">Showing the latest 200 Requests.</p>}
    {showOlder && <Button variant="secondary" size="sm" loading={older.pending} onClick={showOlderDone}>Show older Done</Button>}
    {older.error && <p role="alert" className="m-0">{older.error}</p>}
  </div> : null

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
        ? <RequestRowActions requests={rows} context={context} isGuest={isGuest}><DataTable data={rows} columns={columns} projectName={projectName} context={context} isGuest={isGuest} footer={footer} /></RequestRowActions>
        : <DataTable data={rows} columns={columns} projectName={projectName} context={context} isGuest={isGuest} footer={footer} />}
    </div>
  )
}

/** A Project filter that names no Project in this workspace. Clearing it stays on this page with no request. */
export function ProjectUnavailable() {
  const setView = useSetRequestListView()
  return <div data-slot="requests-workspace" className="flex min-w-0 flex-1 flex-col p-6">
    <div><SidebarExpandButton /></div>
    <h1 className="sr-only">Project unavailable</h1>
    <div className="my-auto"><EmptyState icon={<Folder />} title="Project unavailable" description="This Project could not be found or is not available in this workspace." action={<Button variant="secondary" size="sm" onClick={() => setView(view => withListContext(view, { project: "all" }))}>View all Requests</Button>} /></div>
  </div>
}
