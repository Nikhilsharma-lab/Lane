import type { Meta, StoryContext, StoryObj } from "@storybook/nextjs-vite"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { useState, type ReactNode } from "react"

import { RequestsOverview } from "@/app/(app)/requests-overview"
import { RequestsWorkspaceLoading } from "@/app/(app)/requests-workspace-loading"
import { listProjects } from "@/app/(app)/intake/project-actions"
import { Button } from "@/components/arc/button/button"
import { SidebarView } from "@/components/shell/sidebar-view"
import { RequestListViewProvider } from "@/components/requests/list-view-state"
import { NewRequestProvider } from "@/components/requests/new-request-provider"
import { PendingMutationsProvider, usePendingMutationWriter } from "@/components/requests/pending-mutations-provider"
import type { OverviewRequest } from "@/lib/request-overview"
import tableStyles from "@/components/requests/tasks/data-table-toolbar.module.css"
import shellStyles from "@/components/shell/workspace-shell.module.css"

// Plan item 2.1: the empty workspace is the real list, rendered through the
// shell and the (app) layout's providers, with the welcome in its records
// region. Illustrative fixtures only; Storybook mocks every server action.
type Role = "admin" | "member" | "guest"
const context = { orgId: "org_welcome_fixture" }
const firstRequest: OverviewRequest = {
  id: "welcome-first-request", requestNumber: 1, title: "Customers cannot find the delivery date before checkout", reframedProblem: null,
  status: "open", createdAt: "2026-10-11T09:00:00.000Z", creatorName: "Alex Morgan", assigneeName: null, assignedTo: null, projectId: null, projectName: null, priority: "none",
}

/** The (app) layout's order: list view state, pending overlay, composer, then
 * the shell. `outside` renders under the same providers but outside <main>. */
function Workspace({ role = "admin", children, outside }: { role?: Role; children: ReactNode; outside?: ReactNode }) {
  return <RequestListViewProvider><PendingMutationsProvider>
    <NewRequestProvider context={context} draftOwnerId="welcome-fixture-person">
      <SidebarView workspaceName="Lane Studio" fullName="Alex Morgan" email="alex@example.test" role={role} pathname="/" statusFilter="all"
        projectFilter="all" projects={[]} notifications={null} onSignOut={() => {}} linearPreviewAutoCollapse>{children}</SidebarView>
      {outside}
    </NewRequestProvider>
  </PendingMutationsProvider></RequestListViewProvider>
}

function EmptyList({ role = "admin" }: { role?: Role }) {
  return <Workspace role={role}><RequestsOverview requests={[]} isGuest={role === "guest"} canInvite={role === "admin"} context={context} /></Workspace>
}

/** A control outside <main> stands in for the composer: it inserts the saved row
 * 600 ms after the click, so the swap falls outside the 500 ms input window and
 * any shift it caused would count. */
function InsertFirstRequest() {
  const writer = usePendingMutationWriter()
  const [done, setDone] = useState(false)
  return <div className="fixed right-4 bottom-4 z-50"><Button variant="secondary" size="sm" disabled={done} onClick={() => {
    setDone(true)
    window.setTimeout(() => writer?.insert(firstRequest), 600)
  }}>Insert first Request</Button></div>
}

const meta = {
  title: "Patterns/Requests welcome",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/", query: {} } },
  },
  beforeEach: async () => {
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] })
    // The composer's form loads on first open; preload it so the keyboard path measures focus, not a chunk download.
    await import("@/app/(app)/intake/intake-form")
  },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const phoneDark = { theme: "dark", viewport: { value: "mobile", isRotated: false } }
const desktopLight = { theme: "light", viewport: { value: "desktop", isRotated: false } }

const mainOf = (canvasElement: HTMLElement) => within(canvasElement).getByRole("main")
const stripOf = (main: HTMLElement) => main.querySelector<HTMLElement>('[data-slot="page-strip"]')!
const welcomeOf = (main: HTMLElement) => main.querySelector<HTMLElement>("[data-requests-welcome]")
const hintOf = (main: HTMLElement) => within(main).getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "Press C to create a Request.")
/** The strip's New Request, found by its href: while the workspace is empty it has no accessible name. */
const stripLinkOf = (main: HTMLElement) => stripOf(main).querySelector<HTMLElement>('a[href="/intake"]')!
const visibleIntakeLinks = (main: HTMLElement) => [...main.querySelectorAll<HTMLElement>('a[href="/intake"]')].filter(link => link.checkVisibility({ visibilityProperty: true }))

async function expectWelcome(canvasElement: HTMLElement, role: Role) {
  const main = mainOf(canvasElement)
  const welcome = welcomeOf(main)
  await expect(welcome).not.toBeNull()
  const inWelcome = within(welcome!)
  await expect(main.querySelectorAll('[data-slot="page-strip"]')).toHaveLength(1)
  await expect(within(stripOf(main)).getByRole("heading", { level: 1 })).toHaveTextContent(role === "guest" ? "My Requests" : "Requests")
  await expect(inWelcome.getByRole("heading", { name: "No Requests yet" })).toBeVisible()
  await expect(inWelcome.getByText(role === "guest" ? "Create a Request and follow it here." : "Create a Request for your team to review and pick up.")).toBeVisible()
  const create = inWelcome.getByRole("link", { name: "New Request" })
  await expect(create).toHaveAttribute("href", "/intake")
  await expect(create).toHaveAttribute("aria-keyshortcuts", "C")
  // Exactly one Intake link (2026-09-29 rule): the strip's keeps its box but is hidden, inert and unnamed.
  const visible = visibleIntakeLinks(main), named = within(main).getAllByRole("link", { name: "New Request" })
  await expect(visible).toHaveLength(1)
  await expect(visible[0]).toBe(create)
  await expect(named).toHaveLength(1)
  await expect(named[0]).toBe(create)
  const stripLink = stripLinkOf(main)
  await expect(stripLink).toHaveAttribute("inert")
  await expect(getComputedStyle(stripLink).visibility).toBe("hidden")
  await expect(stripLink.getBoundingClientRect().width).toBeGreaterThan(0)
  await expect(within(stripOf(main)).queryByRole("link")).not.toBeInTheDocument()
  if (role === "admin") await expect(inWelcome.getByRole("link", { name: "Invite teammates" })).toHaveAttribute("href", "/settings/members")
  else await expect(inWelcome.queryByRole("link", { name: "Invite teammates" })).not.toBeInTheDocument()
  // The toolbar row is drawn but empty: nothing to filter in an empty workspace.
  await expect(main.querySelector('[data-slot="requests-toolbar"]')).toBeEmptyDOMElement()
  await expect(within(main).queryByRole("button", { name: "Filter Requests by title" })).not.toBeInTheDocument()
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
}

export const Admin: Story = { render: () => <EmptyList role="admin" />, play: ({ canvasElement }) => expectWelcome(canvasElement, "admin") }
export const Member: Story = { render: () => <EmptyList role="member" />, play: ({ canvasElement }) => expectWelcome(canvasElement, "member") }
export const Guest: Story = {
  render: () => <EmptyList role="guest" />,
  play: async ({ canvasElement }) => {
    await expectWelcome(canvasElement, "guest")
    // The strip keeps its note where it fits. The welcome's line does not repeat
    // it and still reads on its own on phones, where the note is hidden.
    const main = mainOf(canvasElement)
    const note = within(stripOf(main)).getByText("Only Requests you submit appear here.")
    await expect(getComputedStyle(note).display).toBe(innerWidth <= 640 ? "none" : "block")
    await expect(within(welcomeOf(main)!).queryByText(/Requests you submit appear here/)).not.toBeInTheDocument()
  },
}

export const KeyboardOnly: Story = {
  render: () => <EmptyList role="admin" />,
  play: async ({ canvasElement }) => {
    const main = mainOf(canvasElement)
    const inWelcome = within(welcomeOf(main)!)
    const create = inWelcome.getByRole("link", { name: "New Request" })
    const invite = inWelcome.getByRole("link", { name: "Invite teammates" })
    // Skip link target first, as the browser does after following it; then the
    // strip's expand control where it shows, then the page's one New Request.
    // The strip's own New Request is inert until the first Request arrives.
    main.focus()
    const strip = within(stripOf(main))
    for (const element of [
      ...(innerWidth <= 880 ? [strip.getByRole("button", { name: "Expand sidebar" })] : []),
      create,
    ]) {
      await userEvent.tab()
      await expect(element).toHaveFocus()
    }
    await userEvent.keyboard("{Enter}")
    let dialog = await within(document.body).findByRole("dialog", { name: "New Request" })
    const title = await within(dialog).findByRole("textbox", { name: "Request title" }, { timeout: 5000 })
    await waitFor(() => expect(title).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument())
    await waitFor(() => expect(create).toHaveFocus())
    await userEvent.tab()
    await expect(invite).toHaveFocus()
    await userEvent.tab({ shift: true })
    await expect(create).toHaveFocus()
    // C works from the page as well as from the link.
    await userEvent.keyboard("c")
    dialog = await within(document.body).findByRole("dialog", { name: "New Request" })
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Request title" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument())
    await waitFor(() => expect(create).toHaveFocus())
  },
}

type Box = { node: Element; top: number; height: number }
const box = (node: Element | null): Box => {
  if (!node) throw new Error("Missing element")
  const rect = node.getBoundingClientRect()
  return { node, top: rect.top, height: rect.height }
}

export const FirstRequestInPlace: Story = {
  render: () => <Workspace role="admin" outside={<InsertFirstRequest />}>
    <RequestsOverview requests={[]} isGuest={false} canInvite context={context} />
  </Workspace>,
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready
    const main = mainOf(canvasElement)
    const frame = () => ({
      strip: box(stripOf(main)),
      // Hidden in place while the welcome offers New Request, so showing it moves nothing.
      stripAction: box(stripLinkOf(main)),
      toolbar: box(main.querySelector('[data-slot="requests-toolbar"]')),
      pane: box(main.querySelector(`.${tableStyles.listPane}`)),
    })
    const before = frame()
    const shifts: { value: number; startTime: number; hadRecentInput: boolean }[] = []
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) shifts.push(entry as unknown as (typeof shifts)[number]) })
    observer.observe({ type: "layout-shift" })
    const clickedAt = performance.now()
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Insert first Request" }))
    const row = await within(main).findByRole("link", { name: firstRequest.title }, { timeout: 3000 })
    await expect(row).toHaveAttribute("id", `request-${firstRequest.id}`)
    await expect(welcomeOf(main)).toBeNull()
    await expect(main.querySelector(`.${tableStyles.listPane}`)).not.toHaveAttribute("data-empty-workspace")
    // The first Request brings the list's controls into the row that was waiting for them,
    // and the strip's New Request back, in the same frame as the welcome goes.
    await expect(within(main).getByRole("button", { name: "Filter Requests by title" })).toBeVisible()
    const stripLink = within(stripOf(main)).getByRole("link", { name: "New Request" })
    await expect(stripLink).toBeVisible()
    await expect(stripLink).not.toHaveAttribute("inert")
    // Two frames for any layout-shift entry to be delivered.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    observer.disconnect()
    const after = frame()
    for (const name of ["strip", "stripAction", "toolbar", "pane"] as const) {
      await expect(after[name].node, `${name} is the same element`).toBe(before[name].node)
      await expect(Math.abs(after[name].top - before[name].top), `${name} top`).toBeLessThanOrEqual(1)
      await expect(Math.abs(after[name].height - before[name].height), `${name} height`).toBeLessThanOrEqual(1)
    }
    const cls = shifts.filter(entry => entry.startTime > clickedAt && !entry.hadRecentInput).reduce((sum, entry) => sum + entry.value, 0)
    await expect(cls, "layout shift after the first Request lands").toBeLessThanOrEqual(0.02)
  },
}

/** /?status=done on an empty workspace: the welcome hides the status control, so
 * the view drops the status and the first Request (Open) lands in the "all" view. */
export const FilteredEmptyWorkspace: Story = {
  parameters: { nextjs: { navigation: { pathname: "/", query: { status: "done" } } } },
  render: () => <Workspace role="admin" outside={<InsertFirstRequest />}>
    <RequestsOverview requests={[]} isGuest={false} canInvite context={context} />
  </Workspace>,
  play: async ({ canvasElement }) => {
    const main = mainOf(canvasElement)
    await expectWelcome(canvasElement, "admin")
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Insert first Request" }))
    await within(main).findByRole("link", { name: firstRequest.title }, { timeout: 3000 })
    await expect(welcomeOf(main)).toBeNull()
    await expect(within(main).queryByText("No matching Requests")).not.toBeInTheDocument()
    await expect(within(main).queryByRole("button", { name: "Remove Status: Done" })).not.toBeInTheDocument()
    await expect(main.querySelector('[aria-label="Active filters"]')).toBeNull()
  },
}

/** Renders the list skeleton, then swaps in the empty workspace from a control outside <main>. */
function SkeletonToWelcomeSwap() {
  const [loaded, setLoaded] = useState(false)
  return <Workspace role="admin" outside={<div className="fixed right-4 bottom-4 z-50"><Button variant="secondary" size="sm" disabled={loaded} onClick={() => setLoaded(true)}>Show loaded page</Button></div>}>
    {loaded ? <RequestsOverview requests={[]} isGuest={false} canInvite context={context} /> : <RequestsWorkspaceLoading />}
  </Workspace>
}
export const SkeletonToWelcome: Story = {
  render: () => <SkeletonToWelcomeSwap />,
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready
    const main = mainOf(canvasElement)
    const measure = () => ({ strip: box(stripOf(main)), toolbar: box(main.querySelector(`.${tableStyles.toolbar}`)) })
    const before = measure()
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Show loaded page" }))
    await waitFor(() => expect(main.querySelector("[data-skeleton]")).toBeNull())
    await expect(welcomeOf(main)).not.toBeNull()
    const after = measure()
    for (const name of ["strip", "toolbar"] as const) {
      await expect(Math.abs(after[name].top - before[name].top), `${name} top: skeleton ${before[name].top}, page ${after[name].top}`).toBeLessThanOrEqual(1)
      await expect(Math.abs(after[name].height - before[name].height), `${name} height: skeleton ${before[name].height}, page ${after[name].height}`).toBeLessThanOrEqual(1)
    }
  },
}

/** Pinned stories first prove the browser really uses the pinned width. */
async function expectPinnedViewport({ globals, parameters }: Pick<StoryContext, "globals" | "parameters">) {
  const name = globals.viewport?.value
  await expect(name, "This story pins a viewport").toMatch(/^(mobile|desktop)$/)
  await expect(window.innerWidth, "The browser must actually use the pinned viewport").toBe(Number.parseInt(parameters.viewport.options[name].styles.width, 10))
}
async function expectNoScroll(context: StoryContext) {
  await expectPinnedViewport(context)
  await context.canvasElement.ownerDocument.fonts.ready
  const main = mainOf(context.canvasElement)
  await expect(welcomeOf(main)).not.toBeNull()
  const scrollers = {
    "list pane": main.querySelector(`.${tableStyles.listPane}`),
    content: main.querySelector(`.${shellStyles.content}`),
    document: document.scrollingElement,
  }
  for (const [name, element] of Object.entries(scrollers)) {
    await expect(element, name).not.toBeNull()
    await expect(element!.scrollHeight, `${name} has no vertical scroll`).toBeLessThanOrEqual(element!.clientHeight)
  }
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
}
export const NoScroll390: Story = { globals: phoneDark, render: () => <EmptyList role="admin" />, play: expectNoScroll }
export const NoScroll1440: Story = { globals: desktopLight, render: () => <EmptyList role="admin" />, play: expectNoScroll }

/** Keyboard hints are for fine pointers. Storybook's Chromium always reports one,
 * so the coarse branch is covered by the e2e mobile context (risk 5). */
export const HintVisibility: Story = {
  render: () => <EmptyList role="member" />,
  play: async ({ canvasElement }) => {
    const hint = hintOf(mainOf(canvasElement))
    const fine = window.matchMedia("(pointer: fine)").matches
    await expect(getComputedStyle(hint).display).toBe(fine ? "block" : "none")
    await expect(within(hint).getByText("C")).toHaveProperty("tagName", "KBD")
  },
}
