import { useState } from "react"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { SidebarView, type SidebarViewProps } from "@/components/shell/sidebar-view"
import { NotificationBellView } from "@/components/shell/notification-bell-view"
import { WorkspaceProjectsProvider, useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider"
import { useSetRequestListView, withListContext } from "@/components/requests/list-view-state"
import type { OverviewRequest } from "@/lib/request-overview"
import type { ProjectOption } from "@/lib/request-constants"
import { parseRequestCode } from "@/lib/request-code"
import { requestListHref } from "@/lib/request-workspace"
import { WORKSPACE_SEARCH_PAGE_SIZE, type WorkspaceSearchInput, type WorkspaceSearchResponse } from "@/lib/workspace-search"

export const fixtureProjects: ProjectOption[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Website", description: null },
  { id: "22222222-2222-4222-8222-222222222222", name: "B2B App", description: null },
  { id: "33333333-3333-4333-8333-333333333333", name: "Marketing", description: null },
]

type SearchRequest = Omit<OverviewRequest, "createdAt"> & { createdAt: Date | string; description?: string | null }
type FixtureProps = Pick<SidebarViewProps, "pathname" | "children"> & Partial<Pick<SidebarViewProps,
  "workspaceName" | "fullName" | "email" | "role" | "statusFilter" | "projectFilter">> & {
  orgId?: string
  projects?: ProjectOption[]
  requests?: SearchRequest[]
}
const noRequests: SearchRequest[] = []

function searchWorkspace(input: WorkspaceSearchInput, requests: SearchRequest[], projects: ProjectOption[]): WorkspaceSearchResponse {
  const query = input.query.trim()
  const term = query.toLocaleLowerCase()
  const number = parseRequestCode(query)
  const matches = requests.filter(request => (number !== null && request.requestNumber === number)
    || [request.title, request.reframedProblem, request.description].some(value => value?.toLocaleLowerCase().includes(term)))
  const page = <T,>(items: T[], index = 0) => {
    const current = Math.max(0, Math.trunc(index))
    const start = current * WORKSPACE_SEARCH_PAGE_SIZE
    return { items: items.slice(start, start + WORKSPACE_SEARCH_PAGE_SIZE), total: items.length, hasMore: start + WORKSPACE_SEARCH_PAGE_SIZE < items.length, page: current }
  }
  return { success: true, query,
    requests: page(matches.map(request => ({ id: request.id, requestNumber: request.requestNumber, title: request.title,
      reframedProblem: request.reframedProblem, status: request.status, projectId: request.projectId ?? null,
      projectName: request.projectName ?? null, requestType: request.requestType ?? null,
      createdAt: request.createdAt instanceof Date ? request.createdAt.toISOString() : request.createdAt })), input.requestsPage),
    projects: page(projects.filter(project => [project.name, project.description].some(value => value?.toLocaleLowerCase().includes(term))), input.projectsPage),
  }
}

function NotificationsFixture() {
  const [open, setOpen] = useState(false)
  return <NotificationBellView open={open} onOpenChange={setOpen} unread={0} items={[]} loaded isPending={false}
    onSelect={() => {}} onMarkAllRead={() => {}} onToggleRead={() => {}} onRetry={() => {}} />
}

/** Complete production sidebar, with only its data boundary replaced for Storybook.
 * Keep each page's list/detail providers outside so navigation and comment drafts survive. */
export function WorkspaceSidebarFixture(props: FixtureProps) {
  const shared = useSharedWorkspaceProjects()
  if (shared) return <FixtureBody {...props} />
  // Older fixtures use different IDs for the same sample Project. Adapt the seed,
  // never show two Websites or change the Request's saved Project relationship.
  const projects = [...(props.projects ?? fixtureProjects)]
  for (const request of props.requests ?? noRequests) {
    if (!request.projectId || !request.projectName || projects.some(project => project.id === request.projectId)) continue
    const sample = props.projects === undefined ? projects.findIndex(project => project.name === request.projectName) : -1
    const project = { id: request.projectId, name: request.projectName, description: null }
    if (sample >= 0) projects[sample] = project
    else projects.push(project)
  }
  return <WorkspaceProjectsProvider orgId={props.orgId ?? "org_storybook"} initialProjects={projects}>
    <FixtureBody {...props} />
  </WorkspaceProjectsProvider>
}

function FixtureBody({ children, pathname, workspaceName = "Lane Studio", fullName = "Alex Morgan", email = "alex@example.test",
  role = "member", statusFilter = "all", projectFilter = "all", requests = noRequests }: FixtureProps) {
  const { projects, addProject } = useSharedWorkspaceProjects()!
  const setView = useSetRequestListView()
  return <SidebarView workspaceName={workspaceName} fullName={fullName} email={email} role={role} pathname={pathname}
    statusFilter={statusFilter} projectFilter={projectFilter} projects={projects} notifications={<NotificationsFixture />} onSignOut={() => {}}
    onSearch={async input => searchWorkspace(input, requests, projects)}
    onCreateProject={role === "guest" ? undefined : async name => {
      const existing = projects.find(project => project.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      const project = existing ?? { id: crypto.randomUUID(), name, description: null }
      if (!existing) addProject(project)
      setView(view => withListContext(view, { status: "all", project: project.id }))
      if (pathname !== "/") getRouter().push(requestListHref("all", project.id))
      return project
    }}>
    {children}
  </SidebarView>
}
