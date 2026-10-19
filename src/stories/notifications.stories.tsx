import type { Meta, StoryContext, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { useState } from "react"
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { ListAnnouncerProvider, useListAnnouncer } from "@/components/requests/list-announcer"
import { localLabel } from "@/components/requests/local-time"
import { NotificationBell } from "@/components/shell/notification-bell"
import { NotificationBellView, type NotificationItem } from "@/components/shell/notification-bell-view"
import { listProjects } from "@/app/(app)/intake/project-actions"
import { markAllNotificationsRead, markNotificationRead, markNotificationUnread } from "@/app/(app)/notifications/actions"
import type { OverviewRequest } from "@/lib/request-overview"
import { LinearRequestsFixture } from "./helpers/linear-requests-fixture"

// Illustrative fixture rows, as GET /api/notifications serialises them (plan item 2.7). Never inserted anywhere.
const notifications: NotificationItem[] = [
  { id: "notification-1", type: "comment_added", requestId: "request-1", actorId: "actor-1", readAt: null, createdAt: "2026-01-01T08:00:00.000Z", actorName: "Aditi Rao", requestTitle: "Make first-time setup clearer", requestNumber: 12, reframedProblem: "Customers cannot find the delivery date before checkout" },
  { id: "notification-2", type: "request_done", requestId: "request-2", actorId: "actor-2", readAt: "2026-01-02T08:00:00.000Z", createdAt: "2026-01-01T07:00:00.000Z", actorName: "Rahul Mehta", requestTitle: "Clarify the invitation email", requestNumber: 7, reframedProblem: null },
  { id: "notification-3", type: "invite_accepted", requestId: null, actorId: "actor-3", readAt: null, createdAt: "2026-01-01T06:00:00.000Z", actorName: null, requestTitle: null, requestNumber: null, reframedProblem: null },
]
const read = (item: NotificationItem, readAt = "2026-01-03T08:00:00.000Z"): NotificationItem => ({ ...item, readAt: item.readAt ?? readAt })
const FIRST_ROW = "LAN-12 · Customers cannot find the delivery date before checkout"
const LOAD_FAILED = "Notifications could not be loaded. Try again."
const FAILURE_TITLE = "Could not update notifications"

const phoneDark = { theme: "dark", viewport: { value: "mobile", isRotated: false } }
const desktopLight = { theme: "light", viewport: { value: "desktop", isRotated: false } }

/** Pinned stories first prove the browser really uses the pinned width (app-frame.stories.tsx does the same). */
async function expectPinnedViewport({ globals, parameters }: Pick<StoryContext, "globals" | "parameters">) {
  const name = globals.viewport?.value
  await expect(name, "This story pins a viewport").toMatch(/^(mobile|desktop)$/)
  const width = Number.parseInt(parameters.viewport.options[name].styles.width, 10)
  await expect(window.innerWidth, "The browser must actually use the pinned viewport").toBe(width)
}
async function expectRing(element: HTMLElement) {
  await expect(element).toHaveFocus()
  await expect(getComputedStyle(element).outlineStyle).toBe("solid")
  // Arc's ring is 2px; the reduced-motion browser context reports it as 3px.
  await expect(Number.parseFloat(getComputedStyle(element).outlineWidth)).toBeGreaterThanOrEqual(2)
}

type Answer = Response | Promise<Response>
type RouteStub = { list?: (call: number) => Answer; count?: (call: number) => Answer }
/** Stubs the two GET routes for one fixture workspace; everything else reaches the real fetch. */
function stubRoutes(org: string, stub: RouteStub = {}) {
  const originalFetch = globalThis.fetch
  const calls = { list: 0, count: 0 }
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (url.searchParams.get("org") === org) {
      if (url.pathname === "/api/notifications/unread") return (stub.count ?? (() => Response.json({ count: 2 })))(++calls.count)
      if (url.pathname === "/api/notifications") return (stub.list ?? (() => Response.json({ notifications })))(++calls.list)
    }
    return originalFetch(input, init)
  }
  return { calls, restore: () => { globalThis.fetch = originalFetch } }
}
/** A response the story releases later. */
function held() {
  let release: (response: Response) => void = () => {}
  const response = new Promise<Response>(resolve => { release = resolve })
  return { response, release: (value: Response) => release(value) }
}
/** An action that fails only when the story says so, so the optimistic state can be asserted before the rollback. */
function heldFailure() {
  const rejects: ((error: Error) => void)[] = []
  return { implementation: () => new Promise<never>((_, reject) => { rejects.push(reject) }), rejects, fail: () => { for (const reject of rejects.splice(0)) reject(new Error("Network unavailable")) } }
}
const toastShown = (title: string) => waitFor(() => expect(page().getByText(title)).toBeVisible())
/** The panel's own entrance scales from .97 while it runs, so heights are measured once it has settled (the skeleton pulses inside it are long and finite). */
const settled = (panel: HTMLElement) => waitFor(() => expect(panel.getAnimations().filter(animation => animation.playState === "running")).toHaveLength(0))
function resetActions() {
  mocked(markNotificationRead).mockReset().mockResolvedValue({ success: true })
  mocked(markNotificationUnread).mockReset().mockResolvedValue({ success: true })
  mocked(markAllNotificationsRead).mockReset().mockResolvedValue({ success: true })
  getRouter().push.mockClear()
}

/** The production adapter with the app's toast region and the shell's one polite region. */
function Bell({ orgId }: { orgId: string }) {
  return <ToastStackProvider><ListAnnouncerProvider>
    <NotificationBell orgId={orgId} />
    <ToastStack morph="plain" label="Messages" />
  </ListAnnouncerProvider></ToastStackProvider>
}

const meta = {
  title: "Navigation/Notifications",
  component: NotificationBellView,
  decorators: [(Story) => <div style={{ width: 240, maxWidth: "100%", minHeight: 480 }}><Story /></div>],
  args: {
    open: false, unread: 2, items: notifications, loaded: true,
    onOpenChange: fn(), onSelect: fn(), onToggleRead: fn(), onMarkAllRead: fn(), onRetry: fn(),
  },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open)
    return <NotificationBellView {...args} open={open} onOpenChange={(next) => { setOpen(next); args.onOpenChange(next) }} onSelect={(item) => { args.onSelect(item); setOpen(false) }} />
  },
  parameters: { docs: { description: { component: "Production notification presentation with isolated data/action fixtures. No backend, Clerk, or navigation calls." } } },
} satisfies Meta<typeof NotificationBellView>

export default meta
type Story = StoryObj<typeof meta>

const page = () => within(document.body)
const trigger = (canvasElement: HTMLElement) => within(canvasElement).getByRole("button", { name: /^Notifications/ })
const badge = (canvasElement: HTMLElement, unread: number) => within(canvasElement).getByRole("button", { name: unread ? `Notifications, ${unread} unread` : "Notifications" })
const rowsOf = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>("[data-notification-row]")]
const openButton = (panel: HTMLElement, index: number) => rowsOf(panel)[index].querySelector<HTMLElement>("[data-notification-open]")!
const toggleOf = (row: HTMLElement) => within(row).getByRole("button", { name: /^Mark notification as/ })
/** A pending toggle is aria-disabled, not disabled, so the keyboard focus that pressed it stays put. */
const expectPending = (button: HTMLElement) => expect(button).toHaveAttribute("aria-disabled", "true")
async function expectLive(button: HTMLElement) {
  await expect(button).toBeEnabled()
  await expect(button).not.toHaveAttribute("aria-disabled")
}

async function openNotifications(canvasElement: HTMLElement) {
  await userEvent.click(trigger(canvasElement))
  const panel = await page().findByRole("dialog", { name: "Notifications" })
  await waitFor(() => expect(panel).toBeVisible())
  return panel
}
async function closeNotifications() {
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(page().queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
}

export const Empty: Story = {
  args: { unread: 0, items: [] },
  globals: phoneDark,
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await expect(within(panel).getByText("No notifications")).toBeVisible()
    await expect(within(panel).queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument()
    await expect(panel.querySelector('[role="alert"], [role="status"]')).toBeNull()
  },
}

/** The first open of a session: skeleton rows the height of real rows, one hidden status, no spinner; rows replace them without a height change. */
export const FirstLoad: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-first-load" />,
  beforeEach: () => {
    resetActions()
    const list = held()
    const routes = stubRoutes("fixture-first-load", { list: () => list.response })
    firstLoadRelease = list.release
    return routes.restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    const status = await within(panel).findByRole("status", { name: "Loading notifications…" })
    await expect(status).toBeInTheDocument()
    await expect(within(panel).getAllByRole("status")).toHaveLength(1)
    await expect(panel.querySelector('[class*="spinner"]')).toBeNull()
    const placeholders = [...panel.querySelectorAll<HTMLElement>('ul[aria-hidden="true"] > li')]
    await expect(placeholders).toHaveLength(3)
    const list = placeholders[0].closest<HTMLElement>('[aria-busy="true"]')!
    await settled(panel)
    const skeletonHeights = placeholders.map(row => Math.round(row.getBoundingClientRect().height))
    const before = Math.round(list.getBoundingClientRect().height)
    firstLoadRelease?.(Response.json({ notifications }))
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    await expect(within(panel).queryByRole("status")).not.toBeInTheDocument()
    await settled(panel)
    await expect(rowsOf(panel).map(row => Math.round(row.getBoundingClientRect().height))).toEqual(skeletonHeights)
    await expect(Math.round(list.getBoundingClientRect().height)).toBe(before)
    await expect(list).not.toHaveAttribute("aria-busy")
  },
}
let firstLoadRelease: ((response: Response) => void) | undefined

/** A failed first read shows the status line and Try again; the retry re-reads and shows rows. */
export const LoadErrorAndRetry: Story = {
  globals: phoneDark,
  render: () => <Bell orgId="fixture-load-error" />,
  beforeEach: () => {
    resetActions()
    return stubRoutes("fixture-load-error", { list: call => call === 1 ? new Response(null, { status: 503 }) : Response.json({ notifications }) }).restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    const alert = await within(panel).findByRole("alert")
    await expect(alert).toHaveTextContent(LOAD_FAILED)
    await expect(within(panel).queryByText("No notifications")).not.toBeInTheDocument()
    await expect(rowsOf(panel)).toHaveLength(0)
    await userEvent.click(within(panel).getByRole("button", { name: "Try again" }))
    // The status line goes while the retry reads; focus stays in the panel instead of dropping to the page.
    await expect(panel.contains(document.activeElement)).toBe(true)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    await expect(within(panel).queryByRole("alert")).not.toBeInTheDocument()
    await expect(panel.contains(document.activeElement)).toBe(true)
  },
}

let settleRevalidation: ((response: Response) => void) | undefined

/** The real adapter keeps its last list through a slow refresh, an error and retry. */
export const ReopenKeepsLoadedNotifications: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-reopen" />,
  beforeEach: () => {
    resetActions()
    settleRevalidation = undefined
    const routes = stubRoutes("fixture-reopen", {
      list: call => {
        if (call === 2) return new Promise<Response>(resolve => { settleRevalidation = resolve })
        return Response.json({ notifications: call > 2 ? notifications.slice(1) : notifications })
      },
    })
    reopenCalls = routes.calls
    return () => { settleRevalidation?.(new Response(null, { status: 503 })); routes.restore() }
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(within(panel).getByRole("button", { name: /Aditi Rao commented/ })).toBeVisible())
    await closeNotifications()
    const reopened = await openNotifications(canvasElement)
    await waitFor(() => expect(reopenCalls?.list).toBe(2))
    await expect(within(reopened).getByRole("button", { name: /Aditi Rao commented/ })).toBeVisible()
    await expect(within(reopened).queryByRole("status")).not.toBeInTheDocument()
    await expect(reopened.querySelector('[aria-busy="true"]')).toBeNull()
    settleRevalidation?.(new Response(null, { status: 503 }))
    await expect(await within(reopened).findByText(LOAD_FAILED)).toBeVisible()
    await expect(within(reopened).getByRole("button", { name: /Aditi Rao commented/ })).toBeVisible()
    await userEvent.click(within(reopened).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(reopenCalls?.list).toBe(3))
    await waitFor(() => expect(within(reopened).queryByRole("button", { name: /Aditi Rao commented/ })).not.toBeInTheDocument())
    await expect(within(reopened).getByText("Someone accepted your invite")).toBeVisible()
    await expect(within(reopened).queryByText(LOAD_FAILED)).not.toBeInTheDocument()
  },
}
let reopenCalls: { list: number; count: number } | undefined

/** After one open, Enter on the trigger paints the kept rows in the first animation frame, with the list read still in flight (the Storybook twin of the perf check). */
export const ReopenPaintsInTheNextFrame: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-next-frame" />,
  beforeEach: () => {
    resetActions()
    const routes = stubRoutes("fixture-next-frame", { list: call => call === 1 ? Response.json({ notifications }) : new Promise<Response>(() => {}) })
    return routes.restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    await closeNotifications()
    const button = trigger(canvasElement)
    button.focus()
    const painted = new Promise<{ rows: number; loading: boolean }>(resolve => {
      button.addEventListener("keydown", () => requestAnimationFrame(() => {
        const reopened = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Notifications"]')
        resolve({ rows: reopened ? rowsOf(reopened).length : 0, loading: Boolean(reopened?.querySelector('p[role="status"]')) })
      }), { once: true })
    })
    await userEvent.keyboard("{Enter}")
    const frame = await painted
    await expect(frame.rows).toBe(3)
    await expect(frame.loading).toBe(false)
    const reopened = await page().findByRole("dialog", { name: "Notifications" })
    await expect(reopened.querySelector('[aria-busy="true"]')).toBeNull()
  },
}

/** Line 1 reads the Request by code and reframed problem (the title when there is none), line 2 the event with Done as a status and the local time. */
export const RowsReadTheRequest: Story = {
  globals: desktopLight,
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    const [first, second, invite] = rowsOf(panel)
    // The row's fixed lanes (the e2e row-identity contract): a 16px dot lane, then the Request, then the toggle, 44px tall.
    await settled(panel)
    const lanes = [first.querySelector('span[aria-hidden="true"]')!, openButton(panel, 0), toggleOf(first)].map(element => element.getBoundingClientRect())
    await expect(lanes[0].width).toBe(16)
    await expect(lanes[0].left).toBeLessThan(lanes[1].left)
    await expect(lanes[1].left).toBeLessThan(lanes[2].left)
    await expect(first.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await expect(within(first).getByText(FIRST_ROW)).toBeVisible()
    await expect(within(first).getByRole("button", { name: `${FIRST_ROW}, Aditi Rao commented, ${localLabel(notifications[0].createdAt)}, unread` })).toBeVisible()
    await expect(first).toHaveAttribute("data-unread")
    await expect(within(second).getByText("LAN-7 · Clarify the invitation email")).toBeVisible()
    await expect(within(second).getByText(/^Rahul Mehta marked it Done ·$/)).toBeVisible()
    const time = within(second).getByText(localLabel(notifications[1].createdAt))
    await expect(time.tagName).toBe("TIME")
    await expect(time).toHaveAttribute("datetime", notifications[1].createdAt)
    await expect(time).toHaveAttribute("title", new Date(notifications[1].createdAt).toLocaleString())
    await expect(openButton(panel, 1).getAttribute("aria-label")).not.toMatch(/unread$/)
    await expect(second).not.toHaveAttribute("data-unread")
    await expect(within(invite).getByText("Someone accepted your invite")).toBeVisible()
    await expect(within(invite).queryByText(/·/)).not.toBeInTheDocument()
    await expect(within(panel).getByRole("button", { name: `Someone accepted your invite, ${localLabel(notifications[2].createdAt)}, unread` })).toBeVisible()
    await expect(within(panel).queryByText(/done”|marked “/)).not.toBeInTheDocument()
  },
}

/** Historical review rows keep neutral lines; nothing creates them any more. */
export const HistoricalReviewRows: Story = {
  globals: desktopLight,
  args: { items: [
    { ...notifications[0], id: "review-1", type: "review_requested" },
    { ...notifications[1], id: "review-2", type: "review_responded", readAt: null },
  ] },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await expect(within(panel).getByText(/^Aditi Rao asked for your feedback ·$/)).toBeVisible()
    await expect(within(panel).getByText(/^Rahul Mehta responded to your review ·$/)).toBeVisible()
  },
}

/** The keyboard model inside the panel: Enter on the trigger focuses the first row, J/↓ K/↑ Home End move the ring with no wrap, Tab reaches the toggle, Esc returns to the trigger. */
async function keyboardPlay(canvasElement: HTMLElement) {
  const button = trigger(canvasElement)
  button.focus()
  await userEvent.keyboard("{Enter}")
  const panel = await page().findByRole("dialog", { name: "Notifications" })
  await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
  await expectRing(openButton(panel, 0))
  await expect(panel.querySelectorAll('[data-notification-open][tabindex="0"]')).toHaveLength(1)
  await expect(panel.querySelectorAll('[data-notification-open][tabindex="-1"]')).toHaveLength(2)
  await userEvent.keyboard("j")
  await expectRing(openButton(panel, 1))
  await userEvent.keyboard("{ArrowDown}")
  await expectRing(openButton(panel, 2))
  // No wrap at the end: nothing moves.
  await userEvent.keyboard("j")
  await expect(openButton(panel, 2)).toHaveFocus()
  await userEvent.keyboard("k")
  await expectRing(openButton(panel, 1))
  await userEvent.keyboard("{ArrowUp}")
  await expectRing(openButton(panel, 0))
  await userEvent.keyboard("k")
  await expect(openButton(panel, 0)).toHaveFocus()
  await userEvent.keyboard("{End}")
  await expectRing(openButton(panel, 2))
  await userEvent.keyboard("{Home}")
  await expectRing(openButton(panel, 0))
  await expect(panel.querySelectorAll('[data-notification-open][tabindex="0"]')).toHaveLength(1)
  // Tab from the row reaches its toggle, Shift+Tab comes back.
  await userEvent.tab()
  await expect(toggleOf(rowsOf(panel)[0])).toHaveFocus()
  await userEvent.tab({ shift: true })
  await expect(openButton(panel, 0)).toHaveFocus()
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(page().queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
  await expect(button).toHaveFocus()
}

export const Keyboard: Story = {
  globals: desktopLight,
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    await keyboardPlay(canvasElement)
  },
}

/** At phone width with long content: the same keys, one-line rows with an ellipsis, no horizontal overflow. */
export const KeyboardPhoneLongContent: Story = {
  globals: phoneDark,
  args: { items: [
    { ...notifications[0], actorName: "Aditi Rao and the product research team", reframedProblem: "First-time workspace members cannot tell whether their invitation has been accepted and what they should do next" },
    notifications[1], notifications[2],
  ] },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1)
    await expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    const [long] = rowsOf(panel)
    const primary = within(long).getByText(/^LAN-12 · First-time workspace members/)
    await expect(getComputedStyle(primary).textOverflow).toBe("ellipsis")
    await expect(primary.scrollWidth).toBeGreaterThan(primary.clientWidth)
    await settled(panel)
    const heights = rowsOf(panel).map(row => Math.round(row.getBoundingClientRect().height))
    await expect(new Set(heights).size).toBe(1)
    await closeNotifications()
    await keyboardPlay(canvasElement)
  },
}

const shellRequests: OverviewRequest[] = Array.from({ length: 4 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  requestNumber: index + 1,
  title: `Shell fixture Request ${index + 1}`,
  reframedProblem: null,
  status: "open" as const,
  createdAt: new Date(Date.UTC(2026, 9, 1, 9, 0, 0) - index * 60_000).toISOString(),
  creatorName: "Alex Morgan",
  assigneeName: null,
  assignedTo: null,
  projectId: null,
  projectName: null,
}))

/** Inside the shell, the open panel owns J and K (the list's tab stop stays put) and C, / and ? do nothing. */
export const KeyboardInShell: Story = {
  globals: desktopLight,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/", query: {} } } },
  decorators: [(Story) => <Story />],
  render: () => <LinearRequestsFixture requests={shellRequests} isGuest={false} context={{ orgId: "org_storybook" }} notifications={<NotificationBell orgId="fixture-shell" />} />,
  beforeEach: () => {
    resetActions()
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] })
    return stubRoutes("fixture-shell").restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const stop = () => canvasElement.querySelector<HTMLElement>('[role="row"][tabindex="0"]')!
    const listStop = stop()
    // The session's first open reads the list; with rows kept, the reopen lands focus on the first row.
    const loading = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(loading)).toHaveLength(3))
    await closeNotifications()
    const button = trigger(canvasElement)
    button.focus()
    await userEvent.keyboard("{Enter}")
    const panel = await page().findByRole("dialog", { name: "Notifications" })
    await expect(rowsOf(panel)).toHaveLength(3)
    await expectRing(openButton(panel, 0))
    await userEvent.keyboard("j")
    await expectRing(openButton(panel, 1))
    await expect(stop()).toBe(listStop)
    await userEvent.keyboard("c")
    await userEvent.keyboard("/")
    await userEvent.keyboard("?")
    await expect(page().queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument()
    await expect(page().queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument()
    await expect(document.querySelector('#lane-main input[type="search"]')).toBeNull()
    await expect(openButton(panel, 1)).toHaveFocus()
    await expect(stop()).toBe(listStop)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page().queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
    await expect(button).toHaveFocus()
    // The shell has exactly one polite region, and the bell announced through it.
    await expect(canvasElement.querySelectorAll('[data-slot="list-announcer"]')).toHaveLength(1)
  },
}

/** Records every value an attribute takes on one element, so a flip back can be asserted against. */
function watchAttribute(element: Element, attribute: string) {
  const sequence = [element.getAttribute(attribute)]
  const observer = new MutationObserver(() => {
    const value = element.getAttribute(attribute)
    if (sequence.at(-1) !== value) sequence.push(value)
  })
  observer.observe(element, { attributes: true, attributeFilter: [attribute] })
  return { sequence, stop: () => observer.disconnect() }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 60))

/** Mark read shows at once on the dot, the toggle and the badge; a list response started before the click cannot revert it, and a read after the success carries the same values. */
export const MarkReadIsOptimisticAndNeverReverts: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-optimistic" />,
  beforeEach: () => {
    resetActions()
    let serverUnread = 2
    let serverRows = notifications
    const stale = held()
    optimisticStale = stale
    mocked(markNotificationRead).mockImplementation(() => new Promise(resolve => { optimisticResolve = () => { serverUnread = 1; serverRows = [read(notifications[0]), ...notifications.slice(1)]; resolve({ success: true }) } }))
    const routes = stubRoutes("fixture-optimistic", {
      list: call => call === 2 ? stale.response : Response.json({ notifications: serverRows }),
      count: () => Response.json({ count: serverUnread }),
    })
    optimisticCalls = routes.calls
    return () => { stale.release(new Response(null, { status: 503 })); routes.restore() }
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    await expect(badge(canvasElement, 2)).toBeVisible()
    // A focus starts a second list read, which the stub holds: it started before the click.
    window.dispatchEvent(new Event("focus"))
    await waitFor(() => expect(optimisticCalls?.list).toBe(2))
    const row = rowsOf(panel)[0]
    const watched = watchAttribute(row, "data-unread")
    await userEvent.click(toggleOf(row))
    // The same frame: dot off, toggle relabelled and disabled, badge and chip down by one.
    await expect(row).not.toHaveAttribute("data-unread")
    await expectPending(within(row).getByRole("button", { name: "Mark notification as unread" }))
    await expect(badge(canvasElement, 1)).toBeVisible()
    await expect(within(panel).getByRole("heading", { name: "Notifications" }).parentElement).toHaveTextContent("1")
    await expect(canvasElement.querySelector('[data-slot="list-announcer"]')).toHaveTextContent("Marked read.")
    // The stale list (row still unread on the server) lands: nothing reverts.
    optimisticStale?.release(Response.json({ notifications }))
    await settle()
    await expect(row).not.toHaveAttribute("data-unread")
    await expect(badge(canvasElement, 1)).toBeVisible()
    // The action succeeds: the toggle is live again, the reconciling count agrees, still read.
    optimisticResolve?.()
    await waitFor(() => expectLive(within(row).getByRole("button", { name: "Mark notification as unread" })))
    await waitFor(() => expect(optimisticCalls?.count).toBeGreaterThanOrEqual(3))
    await settle()
    await expect(row).not.toHaveAttribute("data-unread")
    await expect(badge(canvasElement, 1)).toBeVisible()
    // A later read (focus) returns the server row read: the patch clears with the same values.
    window.dispatchEvent(new Event("focus"))
    await waitFor(() => expect(optimisticCalls?.list).toBe(3))
    await settle()
    await expect(row).not.toHaveAttribute("data-unread")
    await expect(badge(canvasElement, 1)).toBeVisible()
    watched.stop()
    await expect(watched.sequence).toEqual(["true", null])
  },
}
let optimisticStale: ReturnType<typeof held> | undefined
let optimisticResolve: (() => void) | undefined
let optimisticCalls: { list: number; count: number } | undefined

/** A rejected mark unread rolls the row and the badge back with the failure toast, and the toggle is live again. */
export const MarkUnreadRollsBack: Story = {
  globals: phoneDark,
  render: () => <Bell orgId="fixture-rollback" />,
  beforeEach: () => {
    resetActions()
    rollbackFailure = heldFailure()
    mocked(markNotificationUnread).mockImplementation(rollbackFailure.implementation)
    return stubRoutes("fixture-rollback").restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    const row = rowsOf(panel)[1]
    await userEvent.click(within(row).getByRole("button", { name: "Mark notification as unread" }))
    await expect(row).toHaveAttribute("data-unread")
    await expect(badge(canvasElement, 3)).toBeVisible()
    await expectPending(within(row).getByRole("button", { name: "Mark notification as read" }))
    await expect(canvasElement.querySelector('[data-slot="list-announcer"]')).toHaveTextContent("Marked unread.")
    rollbackFailure?.fail()
    await waitFor(() => expect(row).not.toHaveAttribute("data-unread"))
    await expect(badge(canvasElement, 2)).toBeVisible()
    await toastShown(FAILURE_TITLE)
    await expect(page().getByText("Check your connection and try again.")).toBeVisible()
    await expectLive(within(row).getByRole("button", { name: "Mark notification as unread" }))
    await expect(within(panel).queryByRole("alert")).not.toBeInTheDocument()
  },
}
let rollbackFailure: ReturnType<typeof heldFailure> | undefined

/** While one row's action is pending, only that row's toggle is disabled; every other control stays live. */
export const DoubleSubmitBlocked: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-double" />,
  beforeEach: () => {
    resetActions()
    mocked(markNotificationRead).mockImplementation(() => new Promise(resolve => { doubleResolve = () => resolve({ success: true }) }))
    return stubRoutes("fixture-double").restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    const [first, second, invite] = rowsOf(panel)
    // From the keyboard: the pending toggle keeps the focus that pressed it, so J, K and Tab still work from there.
    toggleOf(first).focus()
    await userEvent.keyboard("{Enter}")
    await expectPending(toggleOf(first))
    await expect(toggleOf(first)).toHaveFocus()
    await expectLive(toggleOf(second))
    await expectLive(toggleOf(invite))
    await expect(within(panel).getByRole("button", { name: "Mark all read" })).toBeEnabled()
    await expect(openButton(panel, 0)).toBeEnabled()
    await userEvent.click(toggleOf(first))
    await expect(mocked(markNotificationRead)).toHaveBeenCalledTimes(1)
    doubleResolve?.()
    await waitFor(() => expectLive(toggleOf(first)))
    await expect(toggleOf(first)).toHaveFocus()
  },
}
let doubleResolve: (() => void) | undefined

/** Mark all read: every row and the badge change at once, the toolbar hides and focus moves to the active row; a failure reverts, a success never does. */
export const MarkAllRead: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-mark-all" />,
  beforeEach: () => {
    resetActions()
    let serverUnread = 2
    let serverRows = notifications
    markAllFailure = heldFailure()
    mocked(markAllNotificationsRead).mockImplementationOnce(markAllFailure.implementation).mockImplementation(async () => {
      serverUnread = 0
      serverRows = notifications.map(item => read(item))
      return { success: true }
    })
    return stubRoutes("fixture-mark-all", { list: () => Response.json({ notifications: serverRows }), count: () => Response.json({ count: serverUnread }) }).restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    const unreadRows = () => rowsOf(panel).filter(row => row.hasAttribute("data-unread")).length
    // Failure first: the change shows, then reverts with the toast.
    await userEvent.click(within(panel).getByRole("button", { name: "Mark all read" }))
    await expect(unreadRows()).toBe(0)
    await expect(badge(canvasElement, 0)).toBeVisible()
    await expect(within(panel).queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument()
    await expect(openButton(panel, 0)).toHaveFocus()
    markAllFailure?.fail()
    await waitFor(() => expect(unreadRows()).toBe(2))
    await expect(badge(canvasElement, 2)).toBeVisible()
    await toastShown(FAILURE_TITLE)
    await expect(within(panel).getByRole("button", { name: "Mark all read" })).toBeEnabled()
    // Then success: the change shows and stays through the reconciling reads.
    const watched = watchAttribute(rowsOf(panel)[0], "data-unread")
    await userEvent.click(within(panel).getByRole("button", { name: "Mark all read" }))
    await expect(unreadRows()).toBe(0)
    await expect(badge(canvasElement, 0)).toBeVisible()
    await expect(within(panel).queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument()
    // The same words again: the region clears and speaks them on the next frame.
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="list-announcer"]')).toHaveTextContent("All notifications marked read."))
    await waitFor(() => expect(mocked(markAllNotificationsRead)).toHaveBeenCalledTimes(2))
    await settle()
    await settle()
    await expect(unreadRows()).toBe(0)
    await expect(badge(canvasElement, 0)).toBeVisible()
    watched.stop()
    await expect(watched.sequence).toEqual(["true", null])
  },
}
let markAllFailure: ReturnType<typeof heldFailure> | undefined

/** A click-through marks the row read at once and opens the Request; the action's failure only rolls the read state back, with a toast, and the next open shows the row unread with no stale status line. */
export const ReadFailureStillOpensRequest: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-workspace" />,
  beforeEach: () => {
    resetActions()
    // The refusal the action really returns (its only error), released by the story so the optimistic state can be seen first.
    mocked(markNotificationRead).mockImplementation(() => new Promise(resolve => { failureReject = () => resolve({ error: "Not found" }) }))
    return stubRoutes("fixture-workspace").restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    await userEvent.click(openButton(panel, 0))
    // The same frame: the badge is down by one, the Request opens, the panel closes.
    await expect(badge(canvasElement, 1)).toBeVisible()
    await expect(getRouter().push).toHaveBeenCalledWith("/requests/request-1")
    await waitFor(() => expect(page().queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
    // The action follows the navigation, for this notification in this workspace.
    await expect(mocked(markNotificationRead)).toHaveBeenCalledTimes(1)
    await expect(mocked(markNotificationRead)).toHaveBeenCalledWith("notification-1", { orgId: "fixture-workspace" })
    // The action fails: the badge returns, the toast speaks in the read routes' words, and nothing is stored on the closed panel.
    failureReject?.()
    await waitFor(() => expect(badge(canvasElement, 2)).toBeVisible())
    await toastShown(FAILURE_TITLE)
    await expect(page().getByText("Your workspace session changed. Refresh the page to continue.")).toBeVisible()
    const reopened = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(reopened)).toHaveLength(3))
    await expect(rowsOf(reopened)[0]).toHaveAttribute("data-unread")
    await expect(reopened.querySelector('[role="alert"]')).toBeNull()
    await expect(within(reopened).queryByText(/could not be saved/)).not.toBeInTheDocument()
  },
}
let failureReject: (() => void) | undefined

/** A window focus starts exactly one count read; two overlapping reads answer out of order and the later-started one wins. */
export const CountOnFocusLatestWins: Story = {
  globals: desktopLight,
  render: () => <Bell orgId="fixture-focus" />,
  beforeEach: () => {
    resetActions()
    const slow = held()
    focusSlow = slow
    const routes = stubRoutes("fixture-focus", { count: call => call === 2 ? slow.response : Response.json({ count: call === 1 ? 2 : 5 }) })
    focusCalls = routes.calls
    return () => { slow.release(new Response(null, { status: 503 })); routes.restore() }
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    await waitFor(() => expect(badge(canvasElement, 2)).toBeVisible())
    await expect(focusCalls?.count).toBe(1)
    window.dispatchEvent(new Event("focus"))
    await waitFor(() => expect(focusCalls?.count).toBe(2))
    await expect(focusCalls?.list).toBe(0)
    window.dispatchEvent(new Event("focus"))
    await waitFor(() => expect(focusCalls?.count).toBe(3))
    await waitFor(() => expect(badge(canvasElement, 5)).toBeVisible())
    // The earlier read answers late with another value: it started first, so it loses.
    focusSlow?.release(Response.json({ count: 9 }))
    await settle()
    await expect(badge(canvasElement, 5)).toBeVisible()
    await expect(focusCalls?.list).toBe(0)
    document.dispatchEvent(new Event("visibilitychange"))
    await waitFor(() => expect(focusCalls?.count).toBe(4))
  },
}
let focusSlow: ReturnType<typeof held> | undefined
let focusCalls: { list: number; count: number } | undefined

/** An expired session: a 403 keeps the rows and shows the route's message with Try again; an auth-shaped action failure retries once, then rolls back with the toast. */
export const ExpiredSession: Story = {
  globals: phoneDark,
  render: () => <Bell orgId="fixture-expired" />,
  beforeEach: () => {
    resetActions()
    expiredRejects = []
    // Both attempts throw an auth-shaped error; the story releases each one.
    mocked(markNotificationRead).mockImplementation(() => new Promise<never>((_, reject) => { expiredRejects.push(() => reject(new Error("401 Unauthorized"))) }))
    return stubRoutes("fixture-expired", { list: call => call === 1 ? Response.json({ notifications }) : Response.json({ error: "Your workspace session changed. Refresh the page to continue." }, { status: 403 }) }).restore
  },
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const panel = await openNotifications(canvasElement)
    await waitFor(() => expect(rowsOf(panel)).toHaveLength(3))
    window.dispatchEvent(new Event("focus"))
    const alert = await within(panel).findByRole("alert")
    await expect(alert).toHaveTextContent("Your workspace session changed. Refresh the page to continue.")
    await expect(within(panel).getByRole("button", { name: "Try again" })).toBeVisible()
    await expect(rowsOf(panel)).toHaveLength(3)
    await expect(badge(canvasElement, 2)).toBeVisible()
    const row = rowsOf(panel)[0]
    await userEvent.click(toggleOf(row))
    await expect(row).not.toHaveAttribute("data-unread")
    await expect(badge(canvasElement, 1)).toBeVisible()
    await expect(expiredRejects).toHaveLength(1)
    // The first attempt fails as an expired session would: one token refresh, one retry, which fails too.
    expiredRejects.shift()?.()
    await waitFor(() => expect(mocked(markNotificationRead)).toHaveBeenCalledTimes(2))
    await expect(row).not.toHaveAttribute("data-unread")
    expiredRejects.shift()?.()
    await waitFor(() => expect(row).toHaveAttribute("data-unread"))
    await expect(badge(canvasElement, 2)).toBeVisible()
    await toastShown(FAILURE_TITLE)
    await expect(mocked(markNotificationRead)).toHaveBeenCalledTimes(2)
  },
}
let expiredRejects: (() => void)[] = []

export const CompactUnreadCount: Story = {
  args: { compact: true, unread: 120 },
  globals: phoneDark,
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    canvasElement.dataset.notificationViewport = String(window.innerWidth)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("button", { name: "Notifications, 120 unread" })).toBeVisible()
    await expect(canvas.getByText("99+")).toBeVisible()
    const panel = await openNotifications(canvasElement)
    const bounds = panel.getBoundingClientRect()
    await expect(bounds.left).toBeGreaterThanOrEqual(0)
    await expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

/** Schedules the list's delayed match count, as the data table does while a filter is typed. */
function DelayedPageMessage() {
  const announce = useListAnnouncer()
  return <button type="button" onClick={() => announce("3 Requests match.", { key: "count", delay: 200 })}>Filter</button>
}
function ShellWithPage() {
  const [page, setPage] = useState(true)
  return <ListAnnouncerProvider>
    {page && <ListAnnouncerProvider><DelayedPageMessage /></ListAnnouncerProvider>}
    <button type="button" onClick={() => setPage(false)}>Leave the page</button>
  </ListAnnouncerProvider>
}

/** The shell hosts the one polite region (decision D6); a page's pass-through provider still drops its delayed messages when the page goes, so they are never read out on the next page. */
export const PageMessagesEndWithThePage: Story = {
  globals: desktopLight,
  render: () => <ShellWithPage />,
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    const canvas = within(canvasElement)
    const region = () => canvasElement.querySelector('[data-slot="list-announcer"]')!
    await expect(canvasElement.querySelectorAll('[data-slot="list-announcer"]')).toHaveLength(1)
    // Spoken while the page is there.
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }))
    await waitFor(() => expect(region()).toHaveTextContent("3 Requests match."))
    region().textContent = ""
    // Left before the delay ran out: nothing is spoken afterwards.
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }))
    await userEvent.click(canvas.getByRole("button", { name: "Leave the page" }))
    await new Promise(resolve => setTimeout(resolve, 400))
    await expect(region()).toHaveTextContent("")
  },
}
