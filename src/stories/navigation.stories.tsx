import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { useState } from "react"
import { SidebarView, type SidebarViewProps } from "@/components/shell/sidebar-view"
import { NotificationBellView } from "@/components/shell/notification-bell-view"
import { RequestListViewProvider, useRequestListView } from "@/components/requests/list-view-state"
import { Button } from "@/components/arc/button/button"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"

import type { ProjectOption } from "@/lib/request-properties"

const signOut = fn()
const websiteId = "11111111-1111-4111-8111-111111111111"
const appId = "22222222-2222-4222-8222-222222222222"
const projectFixtures: ProjectOption[] = [
  { id: websiteId, name: "Website", description: null },
  { id: appId, name: "B2B App", description: "The customer workspace" },
]
const createdProjectId = "33333333-3333-4333-8333-333333333333"
const createProject = fn<(name: string) => Promise<ProjectOption>>()

function NotificationsFixture({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return <NotificationBellView compact={compact} open={open} onOpenChange={setOpen} unread={0} items={[]} loaded isPending={false} onMarkAllRead={fn()} onToggleRead={fn()} onSelect={fn()} onRetry={fn()} />
}

async function visibleNavigation(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  if (window.innerWidth <= 640) {
    await userEvent.click(await canvas.findByRole("button", { name: "Open navigation" }))
    return within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Navigation" }))
  }
  await canvas.findByRole("navigation", { name: "Primary navigation" })
  return within(canvas.getByRole("complementary", { name: "Workspace sidebar" }))
}

async function closeMobile(canvasElement: HTMLElement) {
  if (window.innerWidth > 640) return
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
}

/** A modified click leaves navigation to the browser and must not touch the drawer. The synthetic
 * event would navigate this test page wherever the modifier is not the platform's new-tab key (it
 * dropped the browser connection on the Linux runner), so its default is cancelled at document level,
 * after the app's own handlers have seen the modified event. */
function modifiedClick(target: Element) {
  document.addEventListener("click", event => event.preventDefault(), { once: true })
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }))
}

async function closeAccountMenu(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body)
  if (!page.queryByRole("menuitem", { name: "Settings", hidden: true })) return
  await userEvent.keyboard("{Escape}")
  // The menu animates out before it unmounts; CI runners take longer than the 1 s default.
  await waitFor(() => expect(page.queryByRole("menuitem", { name: "Settings", hidden: true })).not.toBeInTheDocument(), { timeout: 4000 })
}

const meta = {
  title: "Navigation/Workspace",
  component: SidebarView,
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Actual Arc Pro workspace-sidebar with guarded Project data fixtures and Lane routes. The identity menu contains supported account actions; Arc notification-center presentation keeps controlled server state." } },
  },
  args: {
    children: <div className="p-6"><SidebarExpandButton />Page content stays separate from shared navigation.</div>,
    workspaceName: "Lane Studio",
    fullName: "Nikhil Sharma",
    email: "nikhil@example.test",
    role: "member",
    pathname: "/",
    statusFilter: "all",
    projectFilter: "all",
    projects: projectFixtures,
    notifications: <NotificationsFixture />,
    compactNotifications: <NotificationsFixture compact />,
    onSignOut: signOut,
  },
  beforeEach: () => {
    signOut.mockClear()
    createProject.mockReset()
    createProject.mockImplementation(async name => ({ id: createdProjectId, name, description: null }))
  },
} satisfies Meta<typeof SidebarView>

export default meta
type Story = StoryObj<typeof meta>

export const MemberNavigation: Story = {
  play: async ({ canvasElement, parameters, globals, args }) => {
    const viewportName = globals.viewport?.value
    if (viewportName) {
      const configuredWidth = Number.parseInt(parameters.viewport.options[viewportName].styles.width, 10)
      await expect(window.innerWidth, "The browser must actually use the selected viewport").toBe(configuredWidth)
    }
    canvasElement.dataset.navigationViewport = String(window.innerWidth)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#lane-main")
    await expect(canvas.getAllByRole("main")).toHaveLength(1)
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.queryByRole("group", { name: "Settings" })).not.toBeInTheDocument()
    await expect(nav.getByRole("group", { name: args.workspaceName })).toBeVisible()
    await expect(nav.queryByRole("group", { name: "Request status filters" })).not.toBeInTheDocument()
    await expect(within(nav.getByRole("group", { name: "Projects" })).getAllByRole("link")).toHaveLength(3)
    for (const [name, href] of [["All Requests", "/"], ["Website", `/?project=${websiteId}`], ["B2B App", `/?project=${appId}`], ["No Project", "/?project=none"]]) {
      await expect(nav.getByRole("link", { name })).toHaveAttribute("href", href)
    }
    await expect(nav.getByRole("link", { name: "New Request" })).toHaveAttribute("href", "/intake")
    await expect(nav.getByRole("link", { name: "All Requests" })).toHaveAttribute("aria-current", "page")
    await expect(nav.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument()
    await userEvent.click(nav.getByRole("button", { name: `Account menu, ${args.fullName}` }))
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings/profile")
    await expect(page.getByRole("menuitem", { name: "Invite and manage members" })).toHaveAttribute("href", "/settings/members")
    await closeAccountMenu(canvasElement)
    if (window.innerWidth > 640) {
      const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
      await expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(272)
      await expect(canvas.getByRole("separator", { name: "Resize sidebar" })).toHaveAttribute("aria-valuenow", "272")
      await expect(canvas.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument()
      await expect(canvas.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument()
    }
    await closeMobile(canvasElement)
  },
}

export const GlobalSearchEntry: Story = {
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await userEvent.click(nav.getByRole("button", { name: "Search workspace" }))
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole("main")).not.toHaveAttribute("inert"))
    const search = await canvas.findByRole("searchbox", { name: "Search workspace" })
    await waitFor(() => expect(search).toHaveFocus())
    await expect(canvas.queryByText("Page content stays separate from shared navigation.")).not.toBeVisible()
    const requestsCategory = within(canvas.getByRole("group", { name: "Search category" })).getByRole("button", { name: "Requests" })
    requestsCategory.focus()
    await userEvent.keyboard("/")
    await expect(search).toHaveFocus()
    if (window.innerWidth > 640) {
      requestsCategory.focus()
      await userEvent.click(nav.getByRole("button", { name: "Search workspace" }))
      await expect(search).toHaveFocus()
    }
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByText("Page content stays separate from shared navigation.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: window.innerWidth <= 640 ? "Open navigation" : "Search workspace" })).toHaveFocus()
    // Let Arc's mobile page-label swap settle before the contrast audit.
    await waitFor(() => expect(canvasElement.getAnimations({ subtree: true }).some(animation => animation.playState === "running")).toBe(false))
  },
}

export const GuestNavigation: Story = {
  args: { role: "guest", projects: [projectFixtures[0]] },
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByRole("link", { name: "My Requests" })).toHaveAttribute("aria-current", "page")
    await expect(nav.queryByRole("link", { name: "B2B App" })).not.toBeInTheDocument()
    await expect(nav.queryByRole("link", { name: "Members" })).not.toBeInTheDocument()
    await expect(nav.queryByRole("link", { name: "All Requests" })).not.toBeInTheDocument()
    await userEvent.click(nav.getByRole("button", { name: "Account menu, Nikhil Sharma" }))
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings/profile")
    await expect(page.queryByRole("menuitem", { name: "Invite and manage members" })).not.toBeInTheDocument()
    await waitFor(() => expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible())
    await closeAccountMenu(canvasElement)
    await closeMobile(canvasElement)
  },
}

function selectedStory(pathname: string, statusFilter: string, label: string): Story {
  return {
    args: { pathname, statusFilter },
    play: async ({ canvasElement }) => {
      const nav = await visibleNavigation(canvasElement)
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page")
      await expect(nav.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1)
      await closeMobile(canvasElement)
    },
  }
}

export const OpenRequests = selectedStory("/", "open", "All Requests")
export const InProgressRequestDetail = selectedStory("/requests/example", "in_progress", "All Requests")
export const DoneRequests = selectedStory("/", "done", "All Requests")
export const IntakeSelected: Story = {
  args: { pathname: "/intake" },
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByRole("link", { name: "New Request" })).toHaveAttribute("href", "/intake")
    await closeMobile(canvasElement)
  },
}
export const ProfileSelected: Story = {
  args: { pathname: "/settings/profile" },
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument()
    await userEvent.click(nav.getByRole("button", { name: "Account menu, Nikhil Sharma" }))
    const settings = await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Settings" })
    await expect(settings).toHaveAttribute("href", "/settings/profile")
    await expect(settings).toHaveAttribute("aria-current", "page")
    await closeAccountMenu(canvasElement)
    await closeMobile(canvasElement)
  },
}

export const AccountMenuKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const nav = await visibleNavigation(canvasElement)
    const trigger = nav.getByRole("button", { name: `Account menu, ${args.fullName}` })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const page = within(canvasElement.ownerDocument.body)
    const settings = await page.findByRole("menuitem", { name: "Settings" })
    await waitFor(() => expect(settings).toHaveFocus())
    await userEvent.keyboard("{ArrowDown}")
    const members = page.getByRole("menuitem", { name: "Invite and manage members" })
    await expect(members).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    await expect(page.getByRole("menuitem", { name: "Switch workspace" })).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    const logout = page.getByRole("menuitem", { name: "Log out" })
    await expect(logout).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(page.queryByRole("menuitem", { name: "Log out" })).not.toBeInTheDocument())
    if (window.innerWidth <= 640) {
      await waitFor(() => expect(page.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
      await waitFor(() => expect(within(canvasElement).getByRole("button", { name: "Open navigation" })).toHaveFocus())
    } else {
      await expect(trigger).toHaveFocus()
    }
  },
}

export const ArcAccountIdentity: Story = {
  play: async ({ canvasElement, args }) => {
    const nav = await visibleNavigation(canvasElement)
    await userEvent.click(nav.getByRole("button", { name: `Account menu, ${args.fullName}` }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText(args.email)).toBeVisible())
    const menu = within(page.getByRole("menu", { name: `Account menu, ${args.fullName}` }))
    await expect(menu.getByText(args.fullName)).toBeVisible()
    await closeAccountMenu(canvasElement)
    await closeMobile(canvasElement)
  },
}

export const ModifiedLinksKeepMobileNavigationOpen: Story = {
  play: async ({ canvasElement }) => {
    if (window.innerWidth > 640) return
    const nav = await visibleNavigation(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const dialog = page.getByRole("dialog", { name: "Navigation" })
    modifiedClick(nav.getByRole("link", { name: "New Request" }))
    await expect(dialog).toBeVisible()
    await userEvent.click(nav.getByRole("button", { name: "Account menu, Nikhil Sharma" }))
    const settings = await page.findByRole("menuitem", { name: "Settings" })
    modifiedClick(settings)
    await expect(dialog).toBeVisible()
    await closeAccountMenu(canvasElement)
    await closeMobile(canvasElement)
  },
}

export const MobileDismissalAndNavigation: Story = {
  play: async ({ canvasElement, args }) => {
    if (window.innerWidth > 640) return
    const canvas = within(canvasElement)
    const toggle = await canvas.findByRole("button", { name: "Open navigation" })
    toggle.focus()
    await userEvent.keyboard("{Enter}")
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole("dialog", { name: "Navigation" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await expect(canvas.getByRole("main", { hidden: true })).toHaveAttribute("inert")
    const account = within(dialog).getByRole("button", { name: `Account menu, ${args.fullName}` })
    account.focus()
    await userEvent.tab()
    await expect(within(dialog).getByRole("button", { name: "Search workspace" })).toHaveFocus()
    await userEvent.tab()
    await expect(within(dialog).getByRole("link", { name: "New Request" })).toHaveFocus()
    // The tip now carries the C shortcut after the label.
    const composeTip = await page.findByRole("tooltip", { name: /^New Request/ })
    await waitFor(() => expect(composeTip).toHaveStyle({ opacity: "1" }))
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("tooltip", { name: /^New Request/ })).not.toBeInTheDocument())
    await expect(dialog).toBeVisible()
    await closeMobile(canvasElement)
    await expect(toggle).toHaveFocus()
    const nav = await visibleNavigation(canvasElement)
    await userEvent.click(nav.getByRole("link", { name: "Website" }))
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
    await expect(toggle).toHaveFocus()
    await userEvent.click(toggle)
    const reopened = await page.findByRole("dialog", { name: "Navigation" })
    await waitFor(() => expect(reopened).toBeVisible())
    await closeMobile(canvasElement)
  },
}

export const LongIdentity: Story = {
  args: {
    workspaceName: "Customer Experience and Platform Design, International Workspace",
    fullName: "Alexandria Catherine Montgomery-Worthington",
    email: "alexandria.montgomery-worthington@international-workspace.example.test",
  },
  play: async ({ canvasElement, args }) => {
    const nav = await visibleNavigation(canvasElement)
    await waitFor(() => expect(nav.getByText(args.workspaceName)).toBeVisible())
    await expect(nav.getByRole("button", { name: `Account menu, ${args.fullName}` })).toBeVisible()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    await closeMobile(canvasElement)
  },
}

export const AccountMenuOpen: Story = {
  play: async ({ canvasElement, args }) => {
    const nav = await visibleNavigation(canvasElement)
    await userEvent.click(nav.getByRole("button", { name: `Account menu, ${args.fullName}` }))
    const logout = await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Log out" })
    await waitFor(() => expect(logout).toHaveStyle({ opacity: "1" }))
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Settings" })).toHaveStyle({ opacity: "1" }))
  },
}

export const MobileDrawerOpen: Story = {
  play: async ({ canvasElement }) => {
    if (window.innerWidth > 640) return
    await visibleNavigation(canvasElement)
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Navigation" })
    await waitFor(() => expect(dialog).toBeVisible())
    await waitFor(() => expect(dialog.getAnimations({ subtree: true }).some((animation) => animation.playState === "running")).toBe(false))
  },
}

export const TemplateOffcanvasControls: Story = {
  play: async ({ canvasElement, args }) => {
    if (window.innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const main = canvas.getByRole("main")
    const expandedMainWidth = main.getBoundingClientRect().width
    const resize = canvas.getByRole("separator", { name: "Resize sidebar" })
    resize.focus()
    await userEvent.keyboard("{Home}")
    await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(0))
    expect(main.getBoundingClientRect().width).toBeGreaterThan(expandedMainWidth)
    await expect(sidebar).toHaveAttribute("inert")
    await userEvent.click(within(main).getByRole("button", { name: "Expand sidebar" }))
    await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(272))
    const nav = within(sidebar)
    await expect(nav.getByRole("link", { name: "New Request" })).toBeVisible()
    await expect(nav.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument()
    await userEvent.click(nav.getByRole("button", { name: `Account menu, ${args.fullName}` }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible())
    await waitFor(() => expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("menuitem", { name: "Log out" })).not.toBeInTheDocument())
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const CurrentWorkspaceIdentity: Story = {
  play: async ({ canvasElement, args }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByText(args.workspaceName)).toBeVisible()
    await expect(nav.queryByRole("button", { name: /New workspace/ })).not.toBeInTheDocument()
    await closeMobile(canvasElement)
  },
}

export const SelectedProjectDetail: Story = {
  args: { pathname: "/requests/example", statusFilter: "in_progress", projectFilter: websiteId },
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByRole("link", { name: "Website" })).toHaveAttribute("aria-current", "page")
    await expect(nav.getByRole("link", { name: "Website" })).toHaveAttribute("href", `/?status=in_progress&project=${websiteId}`)
    await expect(nav.getByRole("link", { name: "B2B App" })).toHaveAttribute("href", `/?status=in_progress&project=${appId}`)
    await expect(nav.getByRole("link", { name: "All Requests" })).not.toHaveAttribute("aria-current")
    await closeMobile(canvasElement)
  },
}

export const NoProjectSelected: Story = {
  args: { projectFilter: "none" },
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByRole("link", { name: "No Project" })).toHaveAttribute("aria-current", "page")
    await closeMobile(canvasElement)
  },
}

export const ProjectContextMenus: Story = {
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    for (const name of ["Website", "No Project"]) {
      const link = nav.getByRole("link", { name })
      await userEvent.pointer({ target: link, keys: "[MouseRight]" })
      await waitFor(() => expect(page.getByRole("menu", { name: `${name} actions` })).toBeVisible())
      await waitFor(() => expect(page.getByRole("menuitem", { name: "Open in new tab" })).toBeVisible())
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
      await expect(link).toHaveFocus()
      if (window.innerWidth <= 640) await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible()
    }
    await closeMobile(canvasElement)
  },
}

export const ProjectMenuBackdropKeepsDrawerFocus: Story = {
  play: async ({ canvasElement }) => {
    if (window.innerWidth > 640) return
    const nav = await visibleNavigation(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const link = nav.getByRole("link", { name: "Website" })
    link.focus()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    await waitFor(() => expect(page.getByRole("menuitem", { name: "Open" })).toHaveFocus())
    const dialog = page.getByRole("dialog", { name: "Navigation" })
    const backdrop = dialog.previousElementSibling
    if (!(backdrop instanceof HTMLElement)) throw new Error("Navigation backdrop is missing")
    await userEvent.click(backdrop)
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    await expect(dialog).toBeVisible()
    await expect(link).toHaveFocus()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
    await expect(within(canvasElement).getByRole("button", { name: "Open navigation" })).toHaveFocus()
  },
}

export const ProjectsLoading: Story = {
  args: { projects: [], projectsLoading: true },
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByText("Loading Projects…")).toBeVisible()
    await expect(nav.queryByRole("link", { name: "No Project" })).not.toBeInTheDocument()
    await closeMobile(canvasElement)
  },
}

function ProjectLoadingRecovery(props: SidebarViewProps) {
  const [failed, setFailed] = useState(true)
  return <SidebarView {...props} projects={failed ? [] : projectFixtures} projectsError={failed ? "Projects could not be loaded. Try again." : null} onRetryProjects={() => setFailed(false)} />
}

export const ProjectsLoadErrorAndRetry: Story = {
  render: args => <ProjectLoadingRecovery {...args} />,
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByRole("alert")).toHaveTextContent("Projects could not be loaded. Try again.")
    await userEvent.click(nav.getByRole("button", { name: "Retry Projects" }))
    await expect(nav.getByRole("link", { name: "Website" })).toBeVisible()
    await expect(nav.queryByRole("alert")).not.toBeInTheDocument()
    if (window.innerWidth <= 640) {
      await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Navigation" }).contains(document.activeElement)).toBe(true))
    }
    await closeMobile(canvasElement)
  },
}

export const NoProjects: Story = {
  args: { projects: [] },
  play: async ({ canvasElement }) => {
    const nav = await visibleNavigation(canvasElement)
    await expect(nav.getByText("Create a Project to group your Requests.")).toBeVisible()
    await expect(nav.getByRole("link", { name: "No Project" })).toHaveAttribute("href", "/?project=none")
    await closeMobile(canvasElement)
  },
}

function ProjectCreationHarness(props: SidebarViewProps) {
  const [projects, setProjects] = useState(props.projects ?? [])
  return <SidebarView {...props} projects={projects} onCreateProject={async name => {
    const project = await createProject(name)
    setProjects(current => [...current, project])
    return project
  }} />
}

export const CreateProjectPendingAndSuccess: Story = {
  render: args => <ProjectCreationHarness {...args} />,
  play: async ({ canvasElement }) => {
    let complete: ((project: ProjectOption) => void) | undefined
    createProject.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const nav = await visibleNavigation(canvasElement)
    await userEvent.click(nav.getByRole("button", { name: "New Project" }))
    const name = nav.getByRole("textbox", { name: "Project name" })
    await waitFor(() => expect(name).toHaveFocus())
    await userEvent.type(name, "Marketing")
    await userEvent.keyboard("{Enter}")
    await expect(nav.getByRole("button", { name: "Create Project" })).toBeDisabled()
    await expect(name).toHaveAttribute("readonly")
    await expect(nav.getByText("Creating Project…")).toBeInTheDocument()
    complete?.({ id: createdProjectId, name: "Marketing", description: null })
    await waitFor(() => expect(nav.getByRole("link", { name: "Marketing" })).toHaveAttribute("href", `/?project=${createdProjectId}`))
    await waitFor(() => expect(nav.getByRole("button", { name: "New Project" })).toHaveFocus())
    await expect(nav.queryByRole("textbox", { name: "Project name" })).not.toBeInTheDocument()
    await closeMobile(canvasElement)
  },
}

export const CreateProjectFailureAndRetry: Story = {
  render: args => <ProjectCreationHarness {...args} />,
  play: async ({ canvasElement }) => {
    createProject.mockRejectedValueOnce(new Error("Project could not be created. Try again."))
    const nav = await visibleNavigation(canvasElement)
    await userEvent.click(nav.getByRole("button", { name: "New Project" }))
    const name = nav.getByRole("textbox", { name: "Project name" })
    await userEvent.type(name, "Marketing")
    await userEvent.click(nav.getByRole("button", { name: "Create Project" }))
    await expect(nav.getByRole("alert")).toHaveTextContent("Project could not be created. Try again.")
    await expect(name).toHaveValue("Marketing")
    await waitFor(() => expect(name).toHaveFocus())
    await userEvent.click(nav.getByRole("button", { name: "Create Project" }))
    await waitFor(() => expect(nav.getByRole("link", { name: "Marketing" })).toBeVisible())
    await expect(nav.queryByRole("alert")).not.toBeInTheDocument()
    await closeMobile(canvasElement)
  },
}

export const SidebarKeyboardShortcut: Story = {
  play: async ({ canvasElement }) => {
    if (window.innerWidth <= 640) return
    await visibleNavigation(canvasElement)
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("separator", { name: "Resize sidebar" })
    trigger.focus()
    await userEvent.keyboard("[BracketLeft]")
    await waitFor(() => expect(within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" })).toBeVisible())
    await expect(trigger).toHaveAttribute("aria-valuenow", "0")
    await userEvent.keyboard("[BracketLeft]")
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument())
    await expect(trigger).toHaveAttribute("aria-valuenow", "272")
  },
}

function RequestPageCheckpoint() {
  const [view, setView] = useRequestListView()
  return <div className="flex items-center gap-4 p-6">
    <Button variant="secondary" onClick={() => setView(current => ({ ...current, pagination: { ...current.pagination, pageIndex: 2 } }))}>Show page 3</Button>
    <output aria-label="Current Request page">{view.pagination.pageIndex + 1}</output>
  </div>
}

export const ComposerPreservesListPage: Story = {
  render: args => <RequestListViewProvider><SidebarView {...args}><RequestPageCheckpoint /></SidebarView></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Show page 3" }))
    await expect(canvas.getByLabelText("Current Request page")).toHaveTextContent("3")
    const nav = await visibleNavigation(canvasElement)
    await userEvent.click(nav.getByRole("link", { name: "New Request" }))
    await expect(canvas.getByLabelText("Current Request page")).toHaveTextContent("3")
    if (window.innerWidth <= 640) {
      await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
    }
    const reopened = await visibleNavigation(canvasElement)
    await userEvent.click(reopened.getByRole("link", { name: "Website" }))
    await expect(canvas.getByLabelText("Current Request page")).toHaveTextContent("1")
  },
}
