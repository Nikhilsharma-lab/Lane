import type { Meta, StoryContext, StoryObj } from "@storybook/nextjs-vite"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { useState, type ComponentType, type ReactNode } from "react"
import { SidebarView } from "@/components/shell/sidebar-view"
import { PageStrip } from "@/components/shell/page-strip"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { RequestListViewProvider } from "@/components/requests/list-view-state"
import { RequestDetailView, type RequestDetail } from "@/components/requests/detail-view"
import tableStyles from "@/components/requests/tasks/data-table-toolbar.module.css"
import rowStyles from "@/components/requests/request-rows.module.css"
import { RequestsOverview } from "@/app/(app)/requests-overview"
import { LifecycleButtons } from "@/app/(app)/requests/[id]/lifecycle-buttons"
import { CommentForm } from "@/app/(app)/requests/[id]/comment-form"
import { addComment, markDone, pickUpRequest } from "@/app/(app)/requests/[id]/actions"
import ListLoading from "@/app/(app)/loading"
import DetailLoading from "@/app/(app)/requests/[id]/loading"
import IntakeLoading from "@/app/(app)/intake/loading"
import ProfileLoading from "@/app/(app)/settings/profile/loading"
import MembersLoading from "@/app/(app)/settings/members/loading"
import requestsMeta from "./requests.stories"
import { background } from "./helpers/rendered-colours"

// Plan item 2.0: one 44px strip per page, built from the shell's trail and the
// page's own title, tools, action and overflow; skeletons render the same strip.
// Illustrative fixtures only; Storybook mocks every server action.
const context = { orgId: "org_storybook" }
const websiteId = "11111111-1111-4111-8111-111111111111"
const request: RequestDetail = {
  id: "fixture-request", title: "Show a delivery date before checkout", description: "Customers have to begin checkout before they can see when their order will arrive.",
  reframedProblem: "Customers cannot find the delivery date before checkout", extractedSolution: null, classification: "hybrid",
  affectedPeople: null, desiredChange: null, observedEvidence: null, uncertainty: null, usefulLink: null,
  status: "open", assignedTo: null, createdBy: "fixture-person", createdAt: new Date("2026-10-01T09:00:00Z"), creatorName: "Alex Morgan", assigneeName: null,
}
// The production list's compact rows need saved codes; these numbers are illustrative.
const listRows = requestsMeta.args.requests.slice(0, 12).map((row, index) => ({ ...row, requestNumber: index + 1 }))

function Frame({ pathname, children, workspaceName = "Lane Studio", projects = [], projectFilter = "all" }: { pathname: string; children: ReactNode; workspaceName?: string; projects?: { id: string; name: string; description: null }[]; projectFilter?: string }) {
  return <RequestListViewProvider><SidebarView workspaceName={workspaceName} fullName="Alex Morgan" email="alex@example.test" role="member" pathname={pathname} statusFilter="all"
    projectFilter={projectFilter} projects={projects} notifications={null} onSignOut={() => {}} linearPreviewAutoCollapse>{children}</SidebarView></RequestListViewProvider>
}

/** The loaded detail exactly as requests-workspace.tsx composes it. */
function DetailPage({ current = request, projectFilter = "all" }: { current?: RequestDetail; projectFilter?: string }) {
  return <div data-slot="requests-workspace" className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden">
    <RequestDetailView request={current} comments={[]} attachments={[]} filter="all" projectFilter={projectFilter} isGuest={false}
      lifecycleActions={<LifecycleButtons requestId={current.id} status={current.status} context={context} filter="all" placement="strip" />}
      mobileLifecycleActions={<LifecycleButtons requestId={current.id} status={current.status} context={context} filter="all" fullWidth />}
      commentForm={<CommentForm requestId={current.id} context={context} />}
      attachmentAction={() => null} />
  </div>
}

const phoneDark = { theme: "dark", viewport: { value: "mobile", isRotated: false } }
const desktopLight = { theme: "light", viewport: { value: "desktop", isRotated: false } }

/** Pinned stories first prove the browser really uses the pinned width (navigation.stories.tsx does the same). */
async function expectPinnedViewport({ globals, parameters }: Pick<StoryContext, "globals" | "parameters">) {
  const name = globals.viewport?.value
  await expect(name, "This story pins a viewport").toMatch(/^(mobile|desktop)$/)
  const width = Number.parseInt(parameters.viewport.options[name].styles.width, 10)
  await expect(window.innerWidth, "The browser must actually use the pinned viewport").toBe(width)
}
const pageStrips = (main: HTMLElement) => main.querySelectorAll<HTMLElement>('[data-slot="page-strip"]')
const noHorizontalScroll = () => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
/** 44px at every pointer type: the strip's rule is not a border, so 44px touch controls fit inside. */
const expectStripHeight = (strip: Element) => expect(Math.round(strip.getBoundingClientRect().height)).toBe(44)
/** The end group stops at its last painted control: a hidden or empty action slot adds no gap. */
async function expectNoTrailingGap(strip: HTMLElement) {
  const end = strip.lastElementChild!
  const painted = [...end.querySelectorAll("*")].map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0)
  await expect(painted.length).toBeGreaterThan(0)
  await expect(Math.abs(end.getBoundingClientRect().right - Math.max(...painted.map(box => box.right)))).toBeLessThanOrEqual(0.5)
}

/** Skip link, then each strip control in order: expand, leading, crumbs, action. */
async function keyboardPath(canvasElement: HTMLElement, expected: HTMLElement[]) {
  const canvas = within(canvasElement)
  const main = canvas.getByRole("main")
  // Following the fragment would navigate the test frame, so focus its target
  // the way the browser does: <main> is focusable (tabindex -1).
  await expect(canvas.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", `#${main.id}`)
  main.focus()
  await expect(main).toHaveFocus()
  for (const element of expected) {
    await userEvent.tab()
    await expect(element).toHaveFocus()
  }
}

const meta = {
  title: "Patterns/App frame",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/requests/fixture-request" } } },
  beforeEach: () => {
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    mocked(addComment).mockReset().mockResolvedValue({ success: true })
  },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const StripAnatomy: Story = {
  render: () => <Frame pathname="/requests/fixture-request"><DetailPage /></Frame>,
  play: async ({ canvasElement }) => {
    const main = within(canvasElement).getByRole("main")
    const [strip] = pageStrips(main)
    const inStrip = within(strip)
    await expect(pageStrips(main)).toHaveLength(1)
    await expect(inStrip.getByText("Open", { exact: true })).toBeVisible()
    await expect(strip.querySelector('li[aria-current="page"]')).toHaveTextContent("Request detail")
    if (innerWidth > 640) await expect(inStrip.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Lane StudioRequestsRequest detail")
    if (innerWidth >= 768) await expect(inStrip.getByText(/^Submitted /)).toBeVisible()
    await expectStripHeight(strip)
    await expectNoTrailingGap(strip)
    await keyboardPath(canvasElement, [
      ...(innerWidth <= 880 ? [within(main).getByRole("button", { name: "Expand sidebar" })] : []),
      inStrip.getByRole("link", { name: "Close Request detail" }),
      ...(innerWidth > 640 ? [inStrip.getByRole("link", { name: "Lane Studio" })] : []),
      inStrip.getByRole("link", { name: "Requests" }),
      ...(innerWidth >= 1024 ? [inStrip.getByRole("button", { name: "Pick up" })] : []),
    ])
  },
}

/** A Done Request has no lifecycle move, so the strip ends at its status and date. */
export const StripDoneRequest: Story = {
  render: () => <Frame pathname="/requests/fixture-request"><DetailPage current={{ ...request, status: "done", assignedTo: "fixture-person-2", assigneeName: "Sam Lee" }} /></Frame>,
  play: async ({ canvasElement }) => {
    const [strip] = pageStrips(within(canvasElement).getByRole("main"))
    await expect(within(strip).getByText("Done", { exact: true })).toBeVisible()
    await expect(within(strip).queryByRole("button", { name: /Pick up|Mark done/ })).not.toBeInTheDocument()
    await expectStripHeight(strip)
    await expectNoTrailingGap(strip)
  },
}

export const StripWithOverflow: Story = {
  render: () => <main className="grid gap-6">
    <PageStrip title="With overflow" overflow={<DropdownMenu label="More" items={[{ label: "Copy link" }, { label: "Copy code" }]} />} />
    <PageStrip title="Without overflow" />
  </main>,
  play: async ({ canvasElement }) => {
    const [withOverflow, without] = pageStrips(canvasElement)
    const trigger = within(withOverflow).getByRole("button", { name: "More" })
    await userEvent.click(trigger)
    const menu = await within(document.body).findByRole("menu")
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Copy link" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    // Leaving the prop out renders no trigger and no end group.
    await expect(within(without).queryByRole("button")).not.toBeInTheDocument()
    await expect(without.querySelector("div")).toBeNull()
  },
}

const longWorkspace = "Northwind Platform Design Operations and Research Workspace"
const longProject = "Checkout, delivery promises and post-purchase communication across every market"
function LongContent() {
  return <Frame pathname="/requests/fixture-request" workspaceName={longWorkspace} projects={[{ id: websiteId, name: longProject, description: null }]} projectFilter={websiteId}>
    <DetailPage projectFilter={websiteId} />
  </Frame>
}
async function expectLongContentFits(context: StoryContext) {
  await expectPinnedViewport(context)
  const main = within(context.canvasElement).getByRole("main")
  const [strip] = pageStrips(main)
  await context.canvasElement.ownerDocument.fonts.ready
  await expectStripHeight(strip)
  noHorizontalScroll()
  const shown = [...strip.querySelectorAll("nav li")].filter(item => item.getClientRects().length > 0)
  // Phones drop the workspace crumb but keep the parent, so the list stays one tap away.
  await expect(shown).toHaveLength(innerWidth <= 640 ? 2 : 3)
  await expect(shown.at(-1)).toHaveAttribute("aria-current", "page")
  await expect(getComputedStyle(shown[0], "::before").content, "The first shown crumb has no leading separator").toBe("none")
  // Long names truncate in place instead of wrapping the strip.
  const project = within(strip).getByRole("link", { name: longProject })
  await expect(shown.at(-2)).toContainElement(project)
  await expect(project.scrollWidth).toBeGreaterThan(project.clientWidth)
}
// The layout's list view state holds the Project, as it does after choosing one in the sidebar.
const longContentNavigation = { nextjs: { navigation: { pathname: "/requests/fixture-request", query: { project: websiteId } } } }
export const StripLongContent390: Story = { globals: phoneDark, parameters: longContentNavigation, render: () => <LongContent />, play: expectLongContentFits }
export const StripLongContent1440: Story = { globals: desktopLight, parameters: longContentNavigation, render: () => <LongContent />, play: expectLongContentFits }

function skeletonStory(pathname: string, Loading: ComponentType, status: string, globals: typeof phoneDark): Story {
  return {
    globals,
    render: () => <Frame pathname={pathname}><Loading /></Frame>,
    play: async context => {
      await expectPinnedViewport(context)
      const main = within(context.canvasElement).getByRole("main")
      await expect(pageStrips(main)).toHaveLength(1)
      await expectStripHeight(pageStrips(main)[0])
      // Decorative bars sit in aria-hidden blocks, so the page exposes one live region.
      const statuses = within(main).getAllByRole("status")
      await expect(statuses).toHaveLength(1)
      await expect(statuses[0]).toHaveAccessibleName(status)
      if (innerWidth <= 880) await expect(within(main).getByRole("button", { name: "Expand sidebar" })).toBeVisible()
      noHorizontalScroll()
    },
  }
}
export const ListSkeletonPhoneDark: Story = skeletonStory("/", ListLoading, "Loading Requests", phoneDark)
export const ListSkeletonDesktopLight: Story = skeletonStory("/", ListLoading, "Loading Requests", desktopLight)
export const DetailSkeletonPhoneDark: Story = skeletonStory("/requests/fixture-request", DetailLoading, "Loading selected Request", phoneDark)
export const DetailSkeletonDesktopLight: Story = skeletonStory("/requests/fixture-request", DetailLoading, "Loading selected Request", desktopLight)
export const IntakeSkeletonPhoneDark: Story = skeletonStory("/intake", IntakeLoading, "Loading Intake", phoneDark)
export const IntakeSkeletonDesktopLight: Story = skeletonStory("/intake", IntakeLoading, "Loading Intake", desktopLight)
export const ProfileSkeletonPhoneDark: Story = skeletonStory("/settings/profile", ProfileLoading, "Loading Profile settings", phoneDark)
export const ProfileSkeletonDesktopLight: Story = skeletonStory("/settings/profile", ProfileLoading, "Loading Profile settings", desktopLight)
export const MembersSkeletonPhoneDark: Story = skeletonStory("/settings/members", MembersLoading, "Loading Members", phoneDark)
export const MembersSkeletonDesktopLight: Story = skeletonStory("/settings/members", MembersLoading, "Loading Members", desktopLight)

/** Renders the skeleton, then swaps in the loaded page from a control outside <main>. */
function SkeletonSwap({ pathname, skeleton, page }: { pathname: string; skeleton: ReactNode; page: ReactNode }) {
  const [loaded, setLoaded] = useState(false)
  return <>
    <Frame pathname={pathname}>{loaded ? page : skeleton}</Frame>
    <div className="fixed right-4 bottom-4 z-50"><Button variant="secondary" size="sm" disabled={loaded} onClick={() => setLoaded(true)}>Show loaded page</Button></div>
  </>
}
type Edges = Record<string, { top: number; height: number; left: number }>
function measure(canvasElement: HTMLElement, selectors: Record<string, string>): Edges {
  const main = within(canvasElement).getByRole("main")
  return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
    const element = main.querySelector(selector)
    if (!element) throw new Error(`No ${name} (${selector}) in this frame`)
    const { top, height, left } = element.getBoundingClientRect()
    return [name, { top, height, left }]
  }))
}
async function swapAndCompare(canvasElement: HTMLElement, skeletonSelectors: Record<string, string>, pageSelectors: Record<string, string>, checks: [string, "top" | "height" | "left"][]) {
  await canvasElement.ownerDocument.fonts.ready
  const before = measure(canvasElement, skeletonSelectors)
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Show loaded page" }))
  const main = within(canvasElement).getByRole("main")
  await waitFor(() => expect(main.querySelector("[data-skeleton]")).toBeNull())
  const after = measure(canvasElement, pageSelectors)
  await expectStripHeight(main.querySelector('[data-slot="page-strip"]')!)
  for (const [name, edge] of checks) {
    await expect(Math.abs(after[name][edge] - before[name][edge]), `${name} ${edge}: skeleton ${before[name][edge]}, page ${after[name][edge]}`).toBeLessThanOrEqual(1)
  }
}

export const ListSkeletonMatchesLoaded: Story = {
  parameters: { nextjs: { navigation: { pathname: "/", query: {} } } },
  render: () => <SkeletonSwap pathname="/" skeleton={<ListLoading />} page={<RequestsOverview requests={listRows} isGuest={false} context={context} />} />,
  play: async ({ canvasElement }) => {
    const shared = { strip: '[data-slot="page-strip"]', toolbar: `.${tableStyles.toolbar}`, group: `.${rowStyles.groupHeader}`, row: "li[data-compact-row]" }
    await swapAndCompare(canvasElement, shared, shared, [["strip", "top"], ["strip", "height"], ["toolbar", "top"], ["toolbar", "height"], ["group", "top"], ["row", "top"]])
  },
}

/** Detail sits on the pane's surface, as the strip does: no second tone below the
 * strip, and none at the foot of the pane where a short skeleton ends. */
async function expectOneSurface(canvasElement: HTMLElement, state: string, checkFoot: boolean) {
  const main = within(canvasElement).getByRole("main")
  const [strip] = pageStrips(main)
  const colour = (element: Element | null) => element ? background(element).map(Math.round).join(", ") : "nothing"
  const stripColour = colour(strip)
  const pane = main.getBoundingClientRect()
  const x = pane.left + pane.width / 2
  await expect(colour(main), `${state}: the pane`).toBe(stripColour)
  await expect(colour(strip.nextElementSibling), `${state}: the body below the strip`).toBe(stripColour)
  await expect(colour(document.elementFromPoint(x, strip.getBoundingClientRect().bottom + 2)), `${state}: just below the strip`).toBe(stripColour)
  if (checkFoot) await expect(colour(document.elementFromPoint(x, pane.bottom - 8)), `${state}: the foot of the pane`).toBe(stripColour)
}
async function detailSwap({ canvasElement, ...context }: StoryContext) {
  if (context.globals.viewport?.value) await expectPinnedViewport(context)
  // The loaded page's foot holds its own controls, so only the skeleton checks it.
  await expectOneSurface(canvasElement, "skeleton", true)
  const strip = '[data-slot="page-strip"]'
  await swapAndCompare(canvasElement, { strip, article: '[data-skeleton="detail"] .max-w-3xl' }, { strip, article: "article" }, [["strip", "height"], ["article", "left"], ["article", "top"]])
  await expectOneSurface(canvasElement, "loaded", false)
}
export const DetailSkeletonMatchesLoaded: Story = {
  render: () => <SkeletonSwap pathname="/requests/fixture-request" skeleton={<DetailLoading />} page={<DetailPage />} />,
  play: detailSwap,
}
export const DetailSkeletonMatchesLoaded390: Story = {
  globals: phoneDark,
  render: () => <SkeletonSwap pathname="/requests/fixture-request" skeleton={<DetailLoading />} page={<DetailPage />} />,
  play: detailSwap,
}
