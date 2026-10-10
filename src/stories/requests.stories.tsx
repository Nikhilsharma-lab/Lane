import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within, waitFor } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { useEffect, useState } from "react"
import Link from "next/link"
import { RequestWorkspaceKeyboard } from "@/app/(app)/request-workspace-keyboard"
import { RequestListViewProvider } from "@/components/requests/list-view-state"
import { RequestsWorkspaceLoading } from "@/app/(app)/requests-workspace-loading"
import { RequestsOverview } from "@/app/(app)/requests-overview"
import { SidebarView } from "@/components/shell/sidebar-view"
import { NotificationBellView } from "@/components/shell/notification-bell-view"
import type { OverviewRequest } from "@/lib/request-overview"
import { parseRequestProjectFilter, parseRequestStatusFilter } from "@/lib/request-workspace"
import type { WorkspaceSearchInput, WorkspaceSearchResponse } from "@/lib/workspace-search"
import { WORKSPACE_SEARCH_PAGE_SIZE } from "@/lib/workspace-search"
import { parseRequestCode } from "@/lib/request-code"

const fixtureProjects = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Website", description: null },
  { id: "22222222-2222-4222-8222-222222222222", name: "B2B App", description: null },
  { id: "33333333-3333-4333-8333-333333333333", name: "Marketing", description: null },
]

// Illustrative fixture content only; never inserted into a Lane workspace.
const requestTitles = [
  "Customers cannot find the delivery date before checkout",
  "New teammates do not know which workspace to join",
  "People lose their draft when an upload fails",
  "Members cannot tell who has picked up a Request",
  "Reviewers miss changes in a long conversation",
  "Customers are unsure whether their payment succeeded",
  "Keyboard users cannot reach the account menu",
  "People cannot find an older Request by its problem",
  "New users do not understand why evidence is optional",
  "An invitation link opens the wrong workspace",
  "Designers lack the context needed to start discovery",
  "Long attachment names hide the file type",
  "People cannot tell which fields prevented submission",
  "Mobile users lose their place after reading details",
  "Developers need a clearer problem statement",
  "Members cannot distinguish an empty view from a failed load",
  "People do not notice that a filter is still applied",
  "The completion message does not explain the next step",
  "New teammates cannot find the person who submitted work",
  "Long names make the Members list difficult to scan",
  "A saved role change has no clear confirmation",
  "People are unsure who can see their attachments",
  "Customers abandon the form after a validation error",
  "People cannot find comments that need a response",
  "The dark theme makes secondary text hard to read",
  "A returning user cannot find unfinished work",
  "Empty search results provide no recovery action",
  "The status menu is difficult to operate by keyboard",
  "Teammates interpret the same Request differently",
  "Small screens obscure the primary form action",
  "People mistake an illustrative example for saved work",
  "Members do not know whether a retry saved their change",
]

const requests: OverviewRequest[] = Array.from({ length: 32 }, (_, index) => ({
  id: `fixture-${index + 1}`,
  title: requestTitles[index],
  reframedProblem: null,
  status: (["open", "in_progress", "done"] as const)[index % 3],
  createdAt: "2026-09-28T09:00:00.000Z",
  creatorName: index === 2 ? "Alexandria Long Workspace Member Name" : ["Alex Morgan", "Sam Lee", "Jordan Patel", "Riley Chen"][index % 4],
  assigneeName: index % 3 === 0 ? null : "Sam Lee",
  assignedTo: index % 3 === 0 ? null : "person-sam",
  projectId: index % 4 === 3 ? null : fixtureProjects[index % 3].id,
  projectName: index % 4 === 3 ? null : fixtureProjects[index % 3].name,
}))

const fixtureDescriptions: Record<string, string> = {
  "fixture-1": "The shipping promise is hidden until the final checkout step.",
  "fixture-2": "An invitation needs to show which workspace the teammate will join.",
}

function fixtureWorkspaceSearch(input: WorkspaceSearchInput, sourceRequests: OverviewRequest[], sourceProjects: typeof fixtureProjects): WorkspaceSearchResponse {
  const query = input.query.trim()
  const term = query.toLowerCase()
  const requestNumber = parseRequestCode(query)
  const requestMatches = sourceRequests.filter(request =>
    (requestNumber !== null && request.requestNumber === requestNumber)
    || [request.title, request.reframedProblem, fixtureDescriptions[request.id]].some(value => value?.toLowerCase().includes(term)))
  const projectMatches = sourceProjects.filter(project => [project.name, project.description].some(value => value?.toLowerCase().includes(term)))
  const page = <T,>(items: T[], index: number | undefined) => {
    const current = Math.max(0, Math.trunc(index ?? 0))
    const start = current * WORKSPACE_SEARCH_PAGE_SIZE
    return { items: items.slice(start, start + WORKSPACE_SEARCH_PAGE_SIZE), total: items.length, hasMore: start + WORKSPACE_SEARCH_PAGE_SIZE < items.length, page: current }
  }
  return {
    success: true,
    query,
    requests: page(requestMatches.map(request => ({ id: request.id, requestNumber: request.requestNumber, title: request.title, reframedProblem: request.reframedProblem, status: request.status, projectId: request.projectId ?? null, projectName: request.projectName ?? null, requestType: request.requestType ?? null, createdAt: request.createdAt })), input.requestsPage),
    projects: page(projectMatches.map(project => ({ id: project.id, name: project.name, description: project.description })), input.projectsPage),
  }
}

const meta = {
  title: "Patterns/Requests",
  excludeStories: ["RequestsShellFixture"],
  component: RequestsOverview,
  decorators: [(Story, context) => context.parameters.fullShell ? <Story /> : <main><Story /></main>],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/", query: {} } } },
  args: { requests, filter: "all", isGuest: false },
  beforeEach: () => {
    sessionStorage.removeItem("lane:request-return-focus")
    getRouter().replace.mockClear()
  },
} satisfies Meta<typeof RequestsOverview>
export default meta
type Story = StoryObj<typeof meta>

async function selectFilter(canvasElement: HTMLElement, field: string, value: string) {
  const trigger = within(canvasElement).getByRole("button", { name: "Add filter" })
  await userEvent.click(trigger)
  const panel = within(await within(document.body).findByRole("dialog", { name: "Add filter" }))
  await userEvent.click(await panel.findByRole("menuitem", { name: field }))
  await userEvent.click(await panel.findByRole("menuitemradio", { name: value }))
  await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Add filter" })).not.toBeInTheDocument())
}

// The toolbar's announced result count, shown only while a filter is applied.
const matchCountText = /^\d+ Requests? match(es)?$/

async function openTitleFilter(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Filter Requests by title" }))
  return within(document.body).findByRole("searchbox", { name: "Filter Requests by title" })
}

export const Populated: Story = {}
export const ConsistentToolbarFlyouts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const transitions: string[] = []
    for (const [name, panelName] of [["Add filter", "Add filter"], ["Display", "Display Requests"]]) {
      const trigger = canvas.getByRole("button", { name })
      await userEvent.click(trigger)
      const panel = await page.findByRole("dialog", { name: panelName })
      await waitFor(() => expect(panel.getBoundingClientRect().top).toBeGreaterThanOrEqual(trigger.getBoundingClientRect().bottom))
      const style = getComputedStyle(panel)
      transitions.push(`${style.transitionProperty}|${style.transitionDuration}|${style.transitionTimingFunction}`)
      await expect(trigger).toBeVisible()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(page.queryByRole("dialog", { name: panelName })).not.toBeInTheDocument())
      await expect(trigger).toHaveFocus()
    }
    await expect(transitions[0]).toBe(transitions[1])
  },
}
export const ProjectStatusViews: Story = {
  args: { projectFilter: "11111111-1111-4111-8111-111111111111", projectName: "Website" },
  play: async ({ canvasElement }) => {
    const views = within(within(canvasElement).getByRole("group", { name: "Request status" }))
    await expect(views.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(views.getByRole("button", { name: "In Progress" }))
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/?status=in_progress&project=11111111-1111-4111-8111-111111111111", { scroll: false }))
  },
}
export const Loading: Story = { render: () => <RequestsWorkspaceLoading /> }
export const Guest: Story = { args: { isGuest: true, requests: requests.slice(0, 3) } }
export const EmptyResults: Story = { args: { requests: [] } }
export const LongTitle: Story = { args: { requests: [{ ...requests[0], title: "A customer needs to understand the next step before sharing sensitive information with a teammate in a workspace with several responsibilities and changing priorities" }] } }

function NotificationsFixture() {
  const [open, setOpen] = useState(false)
  return <NotificationBellView open={open} onOpenChange={setOpen} unread={0} items={[]} loaded isPending={false}
    onSelect={() => {}} onMarkAllRead={() => {}} onToggleRead={() => {}} onRetry={() => {}} />
}

export function RequestsShellFixture(args: React.ComponentProps<typeof RequestsOverview> & { linearPreviewAutoCollapse?: boolean }) {
  const [route, setRoute] = useFixtureRequestRoute(args)
  const [projects, setProjects] = useState(fixtureProjects)
  const projectName = projects.find(project => project.id === route.projectFilter)?.name
  // Storybook's Link mock records clicks without invoking its router mock.
  // Supply the server-prop boundary for list links within this fixture only.
  return <div style={{ display: "contents" }} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element).closest("a[href]")
    if (!anchor) return
    const url = new URL(anchor.getAttribute("href")!, "https://lane.example.test")
    if (url.origin !== "https://lane.example.test" || url.pathname !== "/" || url.hash) return
    setRoute({ filter: parseRequestStatusFilter(url.searchParams.get("status") ?? undefined), projectFilter: parseRequestProjectFilter(url.searchParams.get("project")) })
  }}><RequestListViewProvider initialColumnVisibility={args.linearPreviewAutoCollapse ? { requestType: true } : undefined}><SidebarView linearPreviewAutoCollapse={args.linearPreviewAutoCollapse} previewProjectTree={args.linearPreviewAutoCollapse} workspaceName="Lane Studio" fullName="Alex Morgan" email="alex@example.test"
    role={args.isGuest ? "guest" : "member"} pathname="/" statusFilter={route.filter} projectFilter={route.projectFilter} projects={projects}
    notifications={<NotificationsFixture />} onSignOut={() => {}} onSearch={input => Promise.resolve(fixtureWorkspaceSearch(input, args.requests, projects))}
    onCreateProject={async name => {
      const existing = projects.find(project => project.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      const project = existing ?? { id: `40000000-0000-4000-8000-${String(projects.length + 1).padStart(12, "0")}`, name, description: null }
      if (!existing) setProjects(current => [...current, project])
      setRoute({ filter: "all", projectFilter: project.id })
      return project
    }}>
    <RequestsOverview {...args} {...route} projectName={projectName} />
  </SidebarView></RequestListViewProvider></div>
}

export const PopulatedInShell: Story = {
  parameters: { fullShell: true, docs: { description: { story: "Production Requests and workspace sidebar with illustrative in-memory Projects. Navigation and Project creation update this preview; no server data is written." } } },
  render: args => <RequestsShellFixture {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole("main")).toHaveLength(1)
    await expect(canvas.getByRole("heading", { name: "Requests", level: 1 })).toBeVisible()
    const list = canvas.getByRole("list", { name: "Open Requests" })
    await expect(list).toBeVisible()
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument()
    const firstRow = within(list).getAllByRole("listitem")[0]
    await expect(within(firstRow).getByRole("link", { name: requests[0].title })).toBeVisible()
    await expect(within(firstRow).getByRole("button", { name: "Status: Open" })).toBeVisible()
    await expect(within(firstRow).getByRole("button", { name: "Project: Website" })).toBeVisible()
    await expect(within(firstRow).getByRole("button", { name: "Owner: Unassigned" })).toBeVisible()
    await expect(within(firstRow).queryByRole("button", { name: /^Submitted by:/ })).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Display" })).toBeVisible()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    if (window.innerWidth <= 640) {
      await expect(canvas.getByRole("button", { name: "Open navigation" })).toBeVisible()
    } else {
      await expect(canvas.getByRole("navigation", { name: "Primary navigation" })).toBeVisible()
      await expect(canvas.getByRole("link", { name: "All Requests" })).toHaveAttribute("aria-current", "page")
      await expect(canvas.getByRole("button", { name: "New Project" })).toBeVisible()
    }
  },
}

export const SidebarHoverPreview: Story = {
  ...PopulatedInShell,
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    canvas.getByRole("separator", { name: "Resize sidebar" }).focus()
    await userEvent.keyboard("{Home}")
    await waitFor(() => expect(sidebar.getBoundingClientRect().width).toBe(0))
    const expand = canvas.getByRole("button", { name: "Expand sidebar" })
    await userEvent.hover(expand)
    await waitFor(() => expect(expand).toHaveAttribute("aria-expanded", "true"))
    const panel = canvas.getByRole("navigation", { name: "Primary navigation" }).parentElement!
    await waitFor(() => expect(Math.abs(panel.getBoundingClientRect().left)).toBeLessThan(0.1))
    await expect(getComputedStyle(panel).borderTopLeftRadius).toBe("0px")
    await expect(getComputedStyle(panel).borderBottomLeftRadius).toBe("0px")
  },
}

export const WorkspaceSearchInShell: Story = {
  parameters: { fullShell: true },
  render: args => <RequestsShellFixture {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    if (window.innerWidth <= 640) {
      await userEvent.click(canvas.getByRole("button", { name: "Open navigation" }))
      await userEvent.click(within(await page.findByRole("dialog", { name: "Navigation" })).getByRole("button", { name: "Search workspace" }))
    } else {
      await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }))
    }
    const input = await canvas.findByRole("searchbox", { name: "Search workspace" })
    await expect(input).toHaveFocus()
    await userEvent.type(input, "shipping promise{Enter}")
    await waitFor(() => expect(canvas.getByRole("link", { name: /Customers cannot find the delivery date/ })).toBeVisible())
    await userEvent.clear(input)
    await userEvent.type(input, "Marketing{Enter}")
    await waitFor(() => expect(within(canvas.getByRole("region", { name: "Projects results" })).getByRole("link", { name: "Marketing" })).toBeVisible())
    await waitFor(() => expect(getComputedStyle(canvas.getByRole("region", { name: "Projects results" }).parentElement!).opacity).toBe("1"))
  },
}

export const ControlGeometry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const controls = [
      canvas.getByRole("group", { name: "Request status" }),
      canvas.getByRole("button", { name: "Filter Requests by title" }),
      canvas.getByRole("button", { name: "Add filter" }),
      canvas.getByRole("button", { name: "Display" }),
    ]
    // Linear's 28px toolbar controls share one compact row for a mouse (--linear-toolbar-height,
    // data-table-toolbar.module.css); coarse pointers grow every control to 44px.
    const minHeight = matchMedia("(pointer: coarse)").matches ? 44 : 28
    for (const control of controls) {
      await expect(control).toBeVisible()
      await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(minHeight)
    }
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const CompactListHeader: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const workspace = canvasElement.querySelector<HTMLElement>('[data-slot="requests-workspace"]')!
    const heading = canvas.getByRole("heading", { name: "Requests", level: 1 })
    const status = canvas.getByRole("group", { name: "Request status" })
    const search = canvas.getByRole("button", { name: "Filter Requests by title" })
    const filter = canvas.getByRole("button", { name: "Add filter" })
    const display = canvas.getByRole("button", { name: "Display" })
    const firstGroup = canvasElement.querySelector<HTMLElement>('section[aria-label="Open Requests"]')!

    await expect(canvas.queryByRole("searchbox", { name: "Filter Requests by title" })).not.toBeInTheDocument()
    await expect(heading).toBeVisible()
    await expect(Number.parseFloat(getComputedStyle(heading).fontSize)).toBeLessThanOrEqual(16.1)
    for (const icon of [search, filter, display]) {
      await expect(icon).toBeVisible()
      await expect(icon.getBoundingClientRect().width).toBeLessThanOrEqual(48)
      await expect(Math.abs(icon.getBoundingClientRect().top - status.getBoundingClientRect().top)).toBeLessThanOrEqual(8)
    }
    // Title strip + toolbar + 8px gap.
    await expect(firstGroup.getBoundingClientRect().top - workspace.getBoundingClientRect().top).toBeLessThanOrEqual(window.innerWidth <= 640 ? 124 : 105)
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const LocalTitleFilter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const trigger = canvas.getByRole("button", { name: "Filter Requests by title" })
    await userEvent.click(trigger)
    const search = await page.findByRole("searchbox", { name: "Filter Requests by title" })
    await expect(search).toHaveFocus()
    await userEvent.type(search, "delivery date")
    await expect(canvas.getByRole("link", { name: requests[0].title })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: requests[1].title })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("searchbox", { name: "Filter Requests by title" })).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
    await userEvent.click(trigger)
    await userEvent.clear(await page.findByRole("searchbox", { name: "Filter Requests by title" }))
    await expect(canvas.getByRole("link", { name: requests[1].title })).toBeVisible()
  },
}

export const PropertyGeometry: Story = {
  args: { requests: requests.slice(0, 3) },
  play: async ({ canvasElement }) => {
    await document.fonts.ready
    const canvas = within(canvasElement)
    for (const trigger of canvas.getAllByRole("button", { name: /^(Status|Project|Submitted):/ })) {
      const badge = trigger.firstElementChild!
      const content = badge.firstElementChild!.firstElementChild!
      const label = content.lastElementChild!
      const bounds = label.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(label)
      const text = range.getBoundingClientRect()
      // Font ink must fit the truncation box, including lowercase descenders.
      expect.soft(text.top, trigger.getAttribute("aria-label") ?? "label").toBeGreaterThanOrEqual(bounds.top - .25)
      expect.soft(text.bottom, trigger.getAttribute("aria-label") ?? "label").toBeLessThanOrEqual(bounds.bottom + .25)
      const glyph = content.querySelector("svg") ?? content.firstElementChild!
      const iconBox = glyph.getBoundingClientRect()
      const pillBox = badge.getBoundingClientRect()
      expect.soft(Math.abs(iconBox.top + iconBox.height / 2 - pillBox.top - pillBox.height / 2), "icon is vertically centred").toBeLessThanOrEqual(.25)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const SearchAndReset: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = await openTitleFilter(canvasElement)
    await userEvent.type(search, "unmatched query")
    await expect(canvas.getByText(/No matching Requests/)).toBeVisible()
    await userEvent.click(canvas.getAllByRole("button", { name: "Clear filters" })[0])
    await expect(await openTitleFilter(canvasElement)).toHaveValue("")
    await expect(canvas.getByRole("link", { name: requests[0].title })).toBeVisible()
  },
}

export const DisplayPropertiesAndOrder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(canvas.getByRole("button", { name: "Display" }))
    const panel = within(await page.findByRole("dialog", { name: "Display Requests" }))
    await expect(panel.queryByRole("button", { name: "Request" })).not.toBeInTheDocument()
    await userEvent.click(panel.getByRole("combobox", { name: "Order by" }))
    await userEvent.click(await page.findByRole("option", { name: "Title Z–A" }))
    await waitFor(() => expect(page.queryByRole("listbox")).not.toBeInTheDocument())
    const firstRow = within(canvas.getByRole("list", { name: "Open Requests" })).getAllByRole("listitem")[0]
    await expect(within(firstRow).getByRole("link", { name: "The status menu is difficult to operate by keyboard" })).toBeVisible()
    const submittedBy = panel.getByRole("button", { name: "Submitted by" })
    const requestType = panel.getByRole("button", { name: "Request type" })
    // Request type shows by default; Submitted by stays opt-in.
    await expect(submittedBy).toHaveAttribute("aria-pressed", "false")
    await expect(requestType).toHaveAttribute("aria-pressed", "true")
    await expect(canvas.queryByRole("button", { name: /^Submitted by:/ })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole("button", { name: "Request type: No type" })[0]).toBeVisible()
    await userEvent.click(submittedBy)
    await userEvent.click(requestType)
    await expect(canvas.getAllByRole("button", { name: /^Submitted by:/ })[0]).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Request type: No type" })).not.toBeInTheDocument()
    await userEvent.click(submittedBy)
    await userEvent.click(requestType)
    await expect(canvas.queryByRole("button", { name: /^Submitted by:/ })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole("button", { name: "Request type: No type" })[0]).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Display Requests" })).not.toBeInTheDocument())
    await expect(canvas.getByRole("button", { name: "Display" })).toHaveFocus()
  },
}

export const GroupingAndCollapse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(canvas.getByRole("button", { name: "Display" }))
    const panel = within(await page.findByRole("dialog", { name: "Display Requests" }))
    await userEvent.click(panel.getByRole("combobox", { name: "Group by" }))
    await userEvent.click(await page.findByRole("option", { name: "Status" }))
    await waitFor(() => expect(page.queryByRole("listbox")).not.toBeInTheDocument())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Display Requests" })).not.toBeInTheDocument())
    const open = canvas.getByRole("button", { name: "Collapse Open group" })
    open.focus()
    await userEvent.keyboard("{Enter}")
    await expect(open).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.queryByRole("link", { name: requests[0].title })).not.toBeInTheDocument()
    await userEvent.keyboard("{Enter}")
    await expect(open).toHaveAttribute("aria-expanded", "true")
    await expect(canvas.getByRole("link", { name: requests[0].title })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.queryByRole("button", { name: "Collapse Open group" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Collapse Done group" })).toHaveTextContent("7 of 10 Requests")
    await expect(within(canvas.getByRole("list", { name: "Done Requests" })).getAllByRole("listitem")).toHaveLength(7)
  },
}

export const PropertyDetails: Story = {
  args: { filter: "open" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = within(within(canvas.getByRole("list", { name: "Open Requests" })).getAllByRole("listitem")[0])
    const submitted = row.getByRole("button", { name: "Submitted: 28 Sept 2026" })
    await userEvent.click(submitted)
    const panel = within(await within(document.body).findByRole("dialog", { name: "Submitted" }))
    await waitFor(() => expect(panel.getByText("Mon, 28 Sep 2026 09:00:00 GMT")).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(submitted).toHaveFocus())
    await expect(row.getByRole("link", { name: requests[0].title })).toHaveAttribute("href", "/requests/fixture-1?status=open")
    await expect(row.getByRole("link").querySelector("button")).toBeNull()
    await userEvent.click(row.getByRole("button", { name: "Project: Website" }))
    const projectPanel = within(await within(document.body).findByRole("dialog", { name: "Project" }))
    await expect(projectPanel.getByRole("link", { name: "View Project Requests" })).toHaveAttribute("href", `/?status=open&project=${fixtureProjects[0].id}`)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Project" })).not.toBeInTheDocument())
    await userEvent.click(canvas.getAllByRole("button", { name: "Project: No Project" })[0])
    const ungroupedPanel = within(await within(document.body).findByRole("dialog", { name: "Project" }))
    await expect(ungroupedPanel.getByRole("link", { name: "View Requests without a Project" })).toHaveAttribute("href", "/?status=open&project=none")
    await userEvent.keyboard("{Escape}")
  },
}

export const Pagination: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("26 – 32 of 32 Requests")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page")
    await expect(canvas.getByRole("link", { name: requests[11].title })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: requests[0].title })).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }))
    await expect(canvas.getByText("1 – 25 of 32 Requests")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page")
  },
}

export const StatusNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Add filter" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const panel = within(await within(document.body).findByRole("dialog", { name: "Add filter" }))
    await userEvent.click(await panel.findByRole("menuitem", { name: "Status" }))
    await userEvent.click(await panel.findByRole("menuitemradio", { name: "In Progress" }))
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/?status=in_progress", { scroll: false }))
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Add filter" })).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
  },
}

export const FilteredFromUrl: Story = {
  args: { filter: "in_progress" },
  parameters: { nextjs: { navigation: { pathname: "/", query: { status: "in_progress" } } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("button", { name: "Remove Status: In Progress" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: requests[0].title })).not.toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: requests[1].title })).toHaveAttribute("href", "/requests/fixture-2?status=in_progress")
    const count = canvas.getByText("11 Requests match")
    await expect(count).toBeVisible()
    await expect(count).toHaveAttribute("role", "status")
    await userEvent.click(canvas.getByRole("button", { name: "Clear all" }))
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/", { scroll: false }))
  },
}

export const SearchFromLaterPage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Page 2" }))
    await expect(canvas.getByRole("link", { name: requests[11].title })).toBeVisible()
    await userEvent.type(await openTitleFilter(canvasElement), "delivery date")
    await expect(canvas.getByRole("link", { name: requests[0].title })).toBeVisible()
    await expect(canvas.getByText("1 Request matches")).toBeVisible()
    await expect(canvas.queryByText(/No matching Requests/)).not.toBeInTheDocument()
  },
}

export const RestoreFocusOnLaterPage: Story = {
  beforeEach: () => { sessionStorage.setItem("lane:request-return-focus", "fixture-30") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const target = await canvas.findByRole("link", { name: requests[29].title })
    await waitFor(() => expect(target).toHaveFocus())
    await expect(canvas.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page")
    await expect(sessionStorage.getItem("lane:request-return-focus")).toBeNull()
  },
}

export const RestoreFocusInCollapsedGroup: Story = {
  render: args => <RequestListViewProvider><ReturnToListFixture {...args} /></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Collapse Open group" }))
    await userEvent.click(canvas.getByRole("button", { name: "Preview detail transition" }))
    sessionStorage.setItem("lane:request-return-focus", "fixture-1")
    await userEvent.click(canvas.getByRole("button", { name: "Return to list" }))
    await waitFor(() => expect(canvas.getByRole("link", { name: requests[0].title })).toHaveFocus())
    await expect(canvas.getByRole("button", { name: "Collapse Open group" })).toHaveAttribute("aria-expanded", "true")
    await expect(sessionStorage.getItem("lane:request-return-focus")).toBeNull()
  },
}

function ReturnToListFixture(args: React.ComponentProps<typeof RequestsOverview>) {
  const [showList, setShowList] = useState(true)
  return <>
    <button type="button" onClick={() => setShowList(value => !value)}>{showList ? "Preview detail transition" : "Return to list"}</button>
    {showList ? <RequestsOverview {...args} /> : <p>Request detail route</p>}
  </>
}

/** Next supplies new server props after a URL change. Storybook's router is a
 * spy, so this fixture supplies that boundary while keeping real UI behavior. */
function useFixtureRequestRoute(args: React.ComponentProps<typeof RequestsOverview>) {
  const [route, setRoute] = useState({ filter: args.filter, projectFilter: args.projectFilter ?? "all" })
  useEffect(() => {
    const { replace, push } = getRouter()
    const previousReplace = replace.getMockImplementation()
    const previousPush = push.getMockImplementation()
    const navigate = (href: string) => {
      const url = new URL(href, "https://lane.example.test")
      if (url.pathname !== "/") return
      setRoute({ filter: parseRequestStatusFilter(url.searchParams.get("status") ?? undefined), projectFilter: parseRequestProjectFilter(url.searchParams.get("project")) })
    }
    replace.mockImplementation(navigate)
    push.mockImplementation(navigate)
    return () => {
      replace.mockImplementation(previousReplace ?? (() => undefined))
      push.mockImplementation(previousPush ?? (() => undefined))
    }
  }, [])
  return [route, setRoute] as const
}

function UrlControlledRequests({ previewDetail = false, ...args }: React.ComponentProps<typeof RequestsOverview> & { previewDetail?: boolean }) {
  const [route] = useFixtureRequestRoute(args)
  const projectName = args.requests.find(request => request.projectId === route.projectFilter)?.projectName ?? undefined
  const props = { ...args, ...route, projectName }
  return previewDetail ? <ReturnToListFixture {...props} /> : <RequestsOverview {...props} />
}

export const ProjectNavigationInShell: Story = {
  parameters: { fullShell: true },
  render: args => <RequestsShellFixture {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    if (window.innerWidth <= 640) await userEvent.click(canvas.getByRole("button", { name: "Open navigation" }))
    const navigation = within(await page.findByRole("navigation", { name: "Primary navigation" }))
    await userEvent.click(navigation.getByRole("link", { name: "Website" }))
    if (window.innerWidth <= 640) await waitFor(() => expect(page.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
    await expect(canvas.getByRole("heading", { name: "Website", level: 1 })).toBeVisible()
    await expect(canvas.getByRole("link", { name: requests[0].title })).toHaveAttribute("href", `/requests/fixture-1?project=${fixtureProjects[0].id}`)
    await expect(canvas.queryByRole("link", { name: requests[1].title })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Project: Website" })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Display" }))
    const display = within(await page.findByRole("dialog", { name: "Display Requests" }))
    await expect(display.getByRole("button", { name: "Project" })).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(display.getByRole("button", { name: "Project" }))
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Display Requests" })).not.toBeInTheDocument())
    await expect(canvas.getAllByRole("button", { name: "Project: Website" })[0]).toBeVisible()
  },
}

export const ReturnKeepsListView: Story = {
  render: args => <RequestListViewProvider><ReturnToListFixture {...args} /></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.type(await openTitleFilter(canvasElement), "people")
    await userEvent.click(canvas.getByRole("button", { name: "Display" }))
    const panel = within(await page.findByRole("dialog", { name: "Display Requests" }))
    await userEvent.click(panel.getByRole("combobox", { name: "Order by" }))
    await userEvent.click(await page.findByRole("option", { name: "Title Z–A" }))
    await waitFor(() => expect(page.queryByRole("listbox")).not.toBeInTheDocument())
    await userEvent.click(panel.getByRole("combobox", { name: "Group by" }))
    await userEvent.click(await page.findByRole("option", { name: "Status" }))
    await waitFor(() => expect(page.queryByRole("listbox")).not.toBeInTheDocument())
    await userEvent.click(panel.getByRole("button", { name: "Submitted by" }))
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Display Requests" })).not.toBeInTheDocument())
    await userEvent.click(canvas.getByRole("button", { name: "Collapse Open group" }))
    await userEvent.click(canvas.getByRole("button", { name: "Preview detail transition" }))
    await userEvent.click(canvas.getByRole("button", { name: "Return to list" }))
    await expect(await openTitleFilter(canvasElement)).toHaveValue("people")
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("button", { name: "Expand Open group" })).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.getAllByRole("button", { name: /^Submitted by:/ })[0]).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Display" }))
    const restored = within(await page.findByRole("dialog", { name: "Display Requests" }))
    await expect(restored.getByRole("combobox", { name: "Order by" })).toHaveTextContent("Title Z–A")
    await expect(restored.getByRole("combobox", { name: "Group by" })).toHaveTextContent("Status")
    await userEvent.keyboard("{Escape}")
  },
}

export const ClickCloseRecordsReturnFocus: Story = {
  render: () => <>
    <RequestWorkspaceKeyboard selectedRequestId="fixture-7" returnHref="/?status=open" />
    <Link href="/?status=open" onClick={event => event.preventDefault()}>Close Request detail</Link>
  </>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="request-workspace-keyboard"]')).toHaveAttribute("data-ready", "true"))
    await userEvent.click(canvas.getByRole("link", { name: "Close Request detail" }))
    await expect(sessionStorage.getItem("lane:request-return-focus")).toBe("fixture-7")
  },
}

export const ReturnKeepsPagination: Story = {
  render: args => <RequestListViewProvider><ReturnToListFixture {...args} /></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Page 2" }))
    await expect(canvas.getByText("26 – 32 of 32 Requests")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Preview detail transition" }))
    await userEvent.click(canvas.getByRole("button", { name: "Return to list" }))
    await expect(canvas.getByText("26 – 32 of 32 Requests")).toBeVisible()
    await expect(canvas.getByRole("link", { name: requests[11].title })).toBeVisible()
  },
}

export const MissingReturnTargetClearsMarker: Story = {
  beforeEach: () => { sessionStorage.setItem("lane:request-return-focus", "no-longer-visible") },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(sessionStorage.getItem("lane:request-return-focus")).toBeNull())
    await expect(within(canvasElement).getByRole("button", { name: "Filter Requests by title" })).toHaveFocus()
  },
}


const propertyRequests = [
  { ...requests[0], projectId: fixtureProjects[0].id, projectName: "Website", requestType: "bug" as const },
  { ...requests[1], projectId: fixtureProjects[0].id, projectName: "Website", requestType: "improvement" as const },
  { ...requests[2], status: "in_progress" as const, projectId: fixtureProjects[1].id, projectName: "B2B App", requestType: "new_feature" as const },
  { ...requests[3], projectId: null, projectName: null, requestType: null },
]

export const PopulatedWithProjects: Story = { args: { requests: propertyRequests } }

export const ProjectNamedNoProject: Story = {
  args: { requests: [
    { ...requests[0], projectId: fixtureProjects[0].id, projectName: "No Project" },
    { ...requests[1], projectId: fixtureProjects[1].id, projectName: "none" },
    { ...requests[2], projectId: fixtureProjects[2].id, projectName: fixtureProjects[0].id },
    { ...requests[3], projectId: null, projectName: null },
  ] },
  render: args => <RequestListViewProvider><UrlControlledRequests {...args} /></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await selectFilter(canvasElement, "Project", "No Project")
    await expect(canvas.getByRole("link", { name: requests[0].title })).toHaveAttribute("href", `/requests/fixture-1?project=${fixtureProjects[0].id}`)
    await expect(canvas.queryByRole("link", { name: requests[3].title })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Remove Project: No Project" }))
    await selectFilter(canvasElement, "Project", "none")
    await expect(canvas.getByRole("link", { name: requests[1].title })).toHaveAttribute("href", `/requests/fixture-2?project=${fixtureProjects[1].id}`)
    await userEvent.click(canvas.getByRole("button", { name: "Remove Project: none" }))
    await selectFilter(canvasElement, "Project", fixtureProjects[0].id)
    await expect(canvas.getByRole("link", { name: requests[2].title })).toHaveAttribute("href", `/requests/fixture-3?project=${fixtureProjects[2].id}`)
    await userEvent.click(canvas.getByRole("button", { name: `Remove Project: ${fixtureProjects[0].id}` }))
    await selectFilter(canvasElement, "Project", "Requests without a Project")
    await expect(canvas.getByRole("link", { name: requests[3].title })).toHaveAttribute("href", "/requests/fixture-4?project=none")
  },
}

export const ProjectAndTypeFilters: Story = {
  args: { requests: propertyRequests },
  render: args => <RequestListViewProvider><UrlControlledRequests {...args} /></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await selectFilter(canvasElement, "Project", "Website")
    await expect(canvas.getByRole("button", { name: "Remove Project: Website" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: requests[0].title })).toHaveAttribute("href", `/requests/fixture-1?project=${fixtureProjects[0].id}`)
    await expect(canvas.getByText("2 Requests match")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: requests[2].title })).not.toBeInTheDocument()
    await selectFilter(canvasElement, "Request type", "Bug")
    await expect(canvas.getByText("1 Request matches")).toBeVisible()
    await expect(canvas.getByRole("link", { name: requests[0].title })).toBeVisible()
    await userEvent.type(await openTitleFilter(canvasElement), "not found")
    await expect(canvas.getByText(/No matching Requests/)).toBeVisible()
    await expect(canvas.getByText("0 Requests match")).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("searchbox", { name: "Filter Requests by title" })).not.toBeInTheDocument())
    await userEvent.click(canvas.getByRole("button", { name: "Clear all" }))
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Remove Project: Website" })).not.toBeInTheDocument())
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Remove Request type: Bug" })).not.toBeInTheDocument())
    // No filter applied: the count leaves with the chips and every Request is back.
    await expect(canvas.queryByText(matchCountText)).not.toBeInTheDocument()
    await expect(canvas.getAllByRole("listitem")).toHaveLength(4)
    await expect(await openTitleFilter(canvasElement)).toHaveValue("")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("searchbox", { name: "Filter Requests by title" })).not.toBeInTheDocument())
    await selectFilter(canvasElement, "Project", "No Project")
    await expect(canvas.getByRole("link", { name: requests[3].title })).toBeVisible()
    await expect(canvas.getByText("1 Request matches")).toBeVisible()
  },
}

export const ProjectFilterWithStatus: Story = {
  args: { requests: propertyRequests, filter: "in_progress" },
  render: args => <RequestListViewProvider><UrlControlledRequests {...args} /></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await selectFilter(canvasElement, "Project", "Website")
    await expect(canvas.getByRole("link", { name: requests[1].title })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: requests[0].title })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("link", { name: requests[2].title })).not.toBeInTheDocument()
    await expect(canvas.getByText("1 Request matches")).toBeVisible()
    await expect(getRouter().replace).toHaveBeenCalledWith(`/?status=in_progress&project=${fixtureProjects[0].id}`, { scroll: false })
    await expect(canvas.getByRole("link", { name: requests[1].title })).toHaveAttribute("href", `/requests/fixture-2?status=in_progress&project=${fixtureProjects[0].id}`)
  },
}

export const ReturnKeepsProjectFilter: Story = {
  args: { requests: propertyRequests },
  render: args => <RequestListViewProvider><UrlControlledRequests {...args} previewDetail /></RequestListViewProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await selectFilter(canvasElement, "Project", "Website")
    await userEvent.click(canvas.getByRole("button", { name: "Preview detail transition" }))
    await userEvent.click(canvas.getByRole("button", { name: "Return to list" }))
    await expect(canvas.getByRole("button", { name: "Remove Project: Website" })).toBeVisible()
    await expect(canvas.getByText("2 Requests match")).toBeVisible()
    await expect(canvas.getByRole("link", { name: requests[0].title })).toHaveAttribute("href", `/requests/fixture-1?project=${fixtureProjects[0].id}`)
  },
}
