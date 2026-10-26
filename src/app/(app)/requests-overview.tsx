"use client"
// Lane Request rows composed from official Arc properties, filters and controls.
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from "react"
import firstRunStyles from "@/components/first-run/first-run.module.css"
import { DataTable } from "@/components/requests/tasks/data-table"
import { columns } from "@/components/requests/tasks/columns"
import { Folder, Plus } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button } from "@/components/arc/button/button"
import buttonStyles from "@/components/arc/button/button.module.css"
import { NewRequestLink } from "@/components/requests/new-request-link"
import { usePublishLoadedRequests, useRequestListContext, useSetRequestListView, withListContext } from "@/components/requests/list-view-state"
import { usePendingMutations } from "@/components/requests/pending-mutations-provider"
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider"
import { rowJourney, type OverviewRequest } from "@/lib/request-overview"
import { finishedViewOf, type FinishedView, type RequestStatusFilter } from "@/lib/request-workspace"
import styles from "./requests-overview.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import { RequestRowActions } from "@/components/requests/request-row-actions"
import { ListAnnouncerProvider } from "@/components/requests/list-announcer"
import { RequestsWelcome } from "./requests-welcome"
import type { PeekViewer } from "@/components/requests/request-peek"
import { SavedViewMenu } from "@/components/requests/saved-view-menu"
import { openSavedView, savedViewChanged, type SavedView } from "@/lib/saved-view-rules"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const OLDER_ERROR = "Older Requests could not be loaded. Try again."


/** Reads older finished Requests through the GET route (plan items 1.7 and 1.16), never a server action.
 * The server filters a status view with the journey module's database condition. */
async function fetchOlder(orgId: string, beforeId: string, view: FinishedView): Promise<{ rows: OverviewRequest[]; hasOlderFinished: boolean }> {
  const query = new URLSearchParams({ org: orgId, before: beforeId, ...(view === "all" ? {} : { status: view }) })
  const response = await fetch(`/api/requests/done?${query}`, { headers: { Accept: "application/json" } })
  const body = await response.json().catch(() => null) as { rows?: OverviewRequest[]; hasOlderFinished?: boolean; error?: string } | null
  if (!response.ok || !body?.rows) throw new Error(body?.error ?? OLDER_ERROR)
  return { rows: body.rows, hasOlderFinished: Boolean(body.hasOlderFinished) }
}

const oldestFirst = (a: OverviewRequest, b: OverviewRequest) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

type OlderPages = { pages: Partial<Record<FinishedView, OverviewRequest[]>>; more: Partial<Record<FinishedView, boolean>>; pending: FinishedView | null; error: string | null }

/**
 * The list's finished Requests past the first load, paged per status view (#133).
 *
 * The first load holds every finished Request newer than its oldest finished row, and each "all"
 * page extends that run. So a view has loaded every one of its Requests newer than the oldest of
 * that run and its own pages: that oldest row is the view's cursor, and each page continues it
 * with no gap. A finished view fetches its first page as soon as it is chosen, so Measuring,
 * Closed and Due soon or overdue are never limited to the newest page of finished work.
 */
function useOlderRequests(requests: OverviewRequest[], status: RequestStatusFilter, context: { orgId: string } | undefined, hasOlderFinished: boolean) {
  const [older, setOlder] = useState<OlderPages>({ pages: {}, more: {}, pending: null, error: null })
  // Server rows win over older pages, so a revalidated row is never shown twice.
  const rows = useMemo(() => {
    const ids = new Set(requests.map(row => row.id))
    const extra = Object.values(older.pages).flat().filter(row => !ids.has(row.id) && (ids.add(row.id), true))
    return extra.length ? [...requests, ...extra] : requests
  }, [requests, older.pages])
  const view = finishedViewOf(status)
  const hasMore = (item: FinishedView) => hasOlderFinished && older.more.all !== false && older.more[item] !== false

  async function load(item: FinishedView) {
    const run = [...requests.filter(row => finishedViewOf(rowJourney(row).status) !== null), ...(older.pages.all ?? []), ...(item === "all" ? [] : older.pages[item] ?? [])]
    const cursor = run.sort(oldestFirst)[0]
    if (!context || !cursor || older.pending) return
    setOlder(current => ({ ...current, pending: item, error: null }))
    try {
      const page = await fetchOlder(context.orgId, cursor.id, item)
      setOlder(current => ({ pages: { ...current.pages, [item]: [...current.pages[item] ?? [], ...page.rows] }, more: { ...current.more, [item]: page.hasOlderFinished }, pending: null, error: null }))
    } catch (error) {
      // A failed first page counts as fetched; "Show older" retries it.
      setOlder(current => ({ ...current, pages: { ...current.pages, [item]: current.pages[item] ?? [] }, pending: null, error: error instanceof Error ? error.message : OLDER_ERROR }))
    }
  }
  const loadFirstPage = useEffectEvent((item: FinishedView) => { void load(item) })
  const firstPageNeeded = view !== null && view !== "all" && hasMore(view) && older.pages[view] === undefined
  useEffect(() => { if (firstPageNeeded && view) loadFirstPage(view) }, [firstPageNeeded, view])

  return { rows, view, showMore: Boolean(context && view && hasMore(view)), pending: older.pending !== null, error: older.error, loadMore: () => { if (view) void load(view) } }
}

const noViews: SavedView[] = []

export function RequestsOverview({ requests, isGuest, readOnly = false, context, activeCapped = false, hasOlderFinished = false, canInvite = false, viewer, firstRun, savedViews = noViews }: {
  /** #219: the person's own saved views; the strip saves, updates, renames and deletes them. */
  savedViews?: SavedView[]
  /** #217: the person's first run, rendered by the server. The first Request guide is an empty workspace's welcome. */
  firstRun?: { node: ReactNode; replacesWelcome: boolean }
  requests: OverviewRequest[]
  isGuest: boolean
  /** A Viewer (#210): the whole workspace's list, with no New Request and no moves. */
  readOnly?: boolean
  /** The empty workspace's welcome offers Invite teammates (admins only). */
  canInvite?: boolean
  context?: { orgId: string }
  /** More Open and In progress Requests exist than the list loads. */
  activeCapped?: boolean
  /** Finished Requests (Done, Measuring, Closed) older than the loaded ones exist on the server. */
  hasOlderFinished?: boolean
  /** Plan item 2.12: who is reading, for the Request preview (read with the page; no extra query). */
  viewer?: PeekViewer
}) {
  const listContext = useRequestListContext()
  const status = listContext?.status ?? "all", project = listContext?.project ?? "all"
  const sharedProjects = useSharedWorkspaceProjects()
  const pendingMutations = usePendingMutations()
  const older = useOlderRequests(requests, status, context, hasOlderFinished)
  const rows = older.rows
  // Plan item 2.8: workspace search matches these rows the moment a person types.
  usePublishLoadedRequests(rows)
  // Plan item 2.1: the emptiness DataTable reads (composer inserts applied), so
  // the strip's New Request and the welcome swap in the same frame. The overlay
  // only adds rows, so a loaded row settles it without applying anything.
  const workspaceEmpty = rows.length === 0 && (pendingMutations?.apply(rows).length ?? 0) === 0

  const projectName = project === "all" || project === "none" ? undefined
    : sharedProjects.projects.find(item => item.id === project)?.name ?? rows.find(row => row.projectId === project)?.projectName ?? undefined
  // A Project id that is malformed or not in this workspace's Projects never
  // falls back to all Requests.
  const projectUnavailable = project !== "all" && project !== "none" && (!UUID_RE.test(project)
    || !sharedProjects.projects.some(item => item.id === project))
  // #219: anyone may keep views, Viewers and Guests included; an empty workspace has nothing to filter yet.
  const viewTools = context && !workspaceEmpty ? <SavedViewMenu views={savedViews} orgId={context.orgId} /> : undefined
  if (projectUnavailable) return <ProjectUnavailable tools={viewTools} />

  const openView = openSavedView(savedViews, listContext?.savedView)
  const heading = openView?.name ?? projectName ?? (project === "none" ? "No Project" : isGuest ? "My Requests" : "Requests")
  const viewNote = openView && savedViewChanged(openView.filters, { status, project }) ? "Filters changed since you saved this view." : undefined
  const showOlder = older.showMore
  const footer = (activeCapped || showOlder || older.error) ? <div className={`${styles.limitNote} flex flex-wrap items-center gap-3 pt-4`}>
    {activeCapped && <p className="m-0">Showing the latest 200 Requests.</p>}
    {showOlder && <Button variant="secondary" size="sm" loading={older.pending} onClick={older.loadMore}>{older.view === "done" ? "Show older Done" : "Show older Requests"}</Button>}
    {older.error && <p role="alert" className="m-0">{older.error}</p>}
  </div> : null

  // Plan item 2.1: the table shows this only while the whole workspace, with
  // composer inserts applied, has no Requests; filters never bring it back.
  // #217: in an empty workspace the first Request guide is the welcome; otherwise a first run sits above the list.
  const guideIsWelcome = Boolean(firstRun?.replacesWelcome && workspaceEmpty)
  const welcome = firstRun?.replacesWelcome
    ? <div data-requests-welcome className={firstRunStyles.welcomeSlot}>{firstRun.node}</div>
    : <RequestsWelcome canInvite={canInvite} isGuest={isGuest} readOnly={readOnly} />

  return (
    <div data-slot="requests-workspace" className={styles.overview}>
      <PageStrip title={heading} heading
        note={viewNote ?? (isGuest ? "Only Requests you submit appear here." : undefined)}
        tools={viewTools}
        // The one labelled way in; the sidebar glyph and the Open group's plus share its name and the C shortcut.
        // An empty workspace has exactly one Intake link, the welcome's (docs/superpowers/plans/2026-09-29-requests-welcome.md):
        // this one keeps its box, hidden and inert, so the first Request shows it without moving the strip.
        action={readOnly ? undefined : <Tooltip content={<>New Request<kbd className={styles.kbd}>C</kbd></>} side="bottom">
          <NewRequestLink inert={workspaceEmpty} className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm} ${styles.newRequest}`}><Plus aria-hidden="true" />New Request</NewRequestLink>
        </Tooltip>} />
      {firstRun && !guideIsWelcome && <div className={firstRunStyles.slot}>{firstRun.node}</div>}
      {/* Plan item 2.4: the list's one polite region, mounted empty so its first message is heard. */}
      <ListAnnouncerProvider>
        {context
          ? <RequestRowActions requests={rows} context={context} isGuest={isGuest} readOnly={readOnly}><DataTable data={rows} columns={columns} projectName={projectName} context={context} isGuest={isGuest} footer={footer} welcome={welcome} viewer={viewer} /></RequestRowActions>
          : <DataTable data={rows} columns={columns} projectName={projectName} context={context} isGuest={isGuest} footer={footer} welcome={welcome} />}
      </ListAnnouncerProvider>
    </div>
  )
}

/** A Project filter that names no Project in this workspace. Clearing it stays on this page with no request.
 * The strip names the state as the page h1; the body says what happened, as the error frames do. */
export function ProjectUnavailable({ tools }: { tools?: ReactNode }) {
  const setView = useSetRequestListView()
  return <div data-slot="requests-workspace" className={styles.overview}>
    <PageStrip title="Project unavailable" heading tools={tools} />
    <div className={styles.unavailable}><EmptyState icon={<Folder />} title="This Project can’t be shown" description="It could not be found or is not available in this workspace." action={<Button variant="secondary" size="sm" onClick={() => setView(view => withListContext(view, { project: "all" }))}>View all Requests</Button>} /></div>
  </div>
}
