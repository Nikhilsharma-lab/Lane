import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { NotificationBell } from "@/components/shell/notification-bell"
import { getNotifications, getUnreadCount, markNotificationRead } from "@/app/(app)/notifications/actions"
import { useState } from "react"
import { NotificationBellView, type NotificationItem } from "@/components/shell/notification-bell-view"

const notifications: Array<NotificationItem & { type: "comment_added" | "request_done" | "invite_accepted" }> = [
  { id: "notification-1", type: "comment_added", requestId: "request-1", actorId: "actor-1", readAt: null, createdAt: new Date("2026-01-01T08:00:00Z"), actorName: "Aditi Rao", requestTitle: "Make first-time setup clearer" },
  { id: "notification-2", type: "request_done", requestId: "request-2", actorId: "actor-2", readAt: new Date("2026-01-02T08:00:00Z"), createdAt: new Date("2026-01-01T07:00:00Z"), actorName: "Rahul Mehta", requestTitle: "Clarify the invitation email" },
  { id: "notification-3", type: "invite_accepted", requestId: null, actorId: "actor-3", readAt: null, createdAt: new Date("2026-01-01T06:00:00Z"), actorName: null, requestTitle: null },
]

const meta = {
  title: "Navigation/Notifications",
  component: NotificationBellView,
  decorators: [(Story) => <div style={{ width: 240, maxWidth: "100%", minHeight: 480 }}><Story /></div>],
  args: {
    open: false, unread: 2, items: notifications, loaded: true, isPending: false,
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

async function openNotifications(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: /^Notifications/ }))
  const page = within(canvasElement.ownerDocument.body)
  const panel = await page.findByRole("dialog", { name: "Notifications" })
  await waitFor(() => expect(panel).toBeVisible())
  return page
}

export const Loading: Story = {
  args: { loaded: false, items: [] },
  play: async ({ canvasElement }) => {
    const page = await openNotifications(canvasElement)
    await expect(await page.findByRole("status", { name: "Loading notifications…" })).toBeVisible()
    await expect(page.queryByText("No notifications yet")).not.toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: { unread: 0, items: [] },
  play: async ({ canvasElement }) => {
    const page = await openNotifications(canvasElement)
    await waitFor(() => expect(page.getByText("No notifications yet")).toBeVisible())
    await expect(page.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument()
  },
}

export const ReadAndUnreadActions: Story = {
  play: async ({ canvasElement, args }) => {
    const page = await openNotifications(canvasElement)
    const panel = within(await page.findByRole("dialog", { name: "Notifications" }))
    await expect(panel.getByText("Aditi Rao commented on “Make first-time setup clearer”")).toBeVisible()
    await expect(panel.getByText("Someone accepted your invite")).toBeVisible()
    await userEvent.click(panel.getAllByRole("button", { name: "Mark notification as read" })[0])
    await expect(args.onToggleRead).toHaveBeenCalledWith(notifications[0])
    await expect(args.onSelect).not.toHaveBeenCalled()
    await userEvent.click(panel.getByRole("button", { name: "Mark notification as unread" }))
    await expect(args.onToggleRead).toHaveBeenCalledWith(notifications[1])
    await userEvent.click(panel.getByRole("button", { name: "Mark all read" }))
    await expect(args.onMarkAllRead).toHaveBeenCalledOnce()
    await userEvent.click(panel.getByRole("button", { name: /Aditi Rao commented on/ }))
    await expect(args.onSelect).toHaveBeenCalledWith(notifications[0])
  },
}

export const PendingUpdates: Story = {
  args: { isPending: true },
  play: async ({ canvasElement }) => {
    const page = await openNotifications(canvasElement)
    await expect(await page.findByRole("button", { name: "Mark all read" })).toBeDisabled()
    for (const button of page.getAllByRole("button", { name: /Mark notification as/ })) await expect(button).toBeDisabled()
  },
}

export const LoadErrorAndRetry: Story = {
  args: { loaded: true, items: [], error: "Notifications could not be loaded. Try again." },
  play: async ({ canvasElement, args }) => {
    const page = await openNotifications(canvasElement)
    const panel = within(page.getByRole("dialog", { name: "Notifications" }))
    const error = await panel.findByText("Notifications could not be loaded. Try again.")
    await waitFor(() => expect(error).toBeVisible())
    await userEvent.click(page.getByRole("button", { name: "Try again" }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
    await expect(page.queryByText("No notifications yet")).not.toBeInTheDocument()
  },
}

export const CompactUnreadCount: Story = {
  args: { compact: true, unread: 120 },
  play: async ({ canvasElement, parameters, globals }) => {
    const viewportName = globals.viewport?.value
    if (viewportName) {
      expect(window.innerWidth).toBe(Number.parseInt(parameters.viewport.options[viewportName].styles.width, 10))
    }
    canvasElement.dataset.notificationViewport = String(window.innerWidth)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("button", { name: "Notifications, 120 unread" })).toBeVisible()
    await expect(canvas.getByText("99+")).toBeVisible()
    const page = await openNotifications(canvasElement)
    const panel = await page.findByRole("dialog", { name: "Notifications" })
    const bounds = panel.getBoundingClientRect()
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const KeyboardAndLongContent: Story = {
  args: { items: [{ ...notifications[0], actorName: "Aditi Rao and the product research team", requestTitle: "Understand why first-time workspace members cannot tell whether their invitation has been accepted and what they should do next" }] },
  play: async ({ canvasElement, parameters, globals }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const viewportName = globals.viewport?.value
    if (viewportName) {
      expect(window.innerWidth).toBe(Number.parseInt(parameters.viewport.options[viewportName].styles.width, 10))
    }
    canvasElement.dataset.notificationViewport = String(window.innerWidth)
    const trigger = canvas.getByRole("button", { name: /^Notifications/ })
    await userEvent.tab()
    await expect(trigger).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    const panel = await page.findByRole("dialog", { name: "Notifications" })
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1)
    expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
  },
}

export const ReadFailureStillOpensRequest: Story = {
  render: () => <NotificationBell orgId="fixture-workspace" />,
  beforeEach: () => {
    getRouter().push.mockClear()
    mocked(getUnreadCount).mockResolvedValue({ success: true, count: 2 })
    mocked(getNotifications).mockResolvedValue({ success: true, notifications })
    mocked(markNotificationRead).mockResolvedValue({ error: "Network unavailable" })
  },
  play: async ({ canvasElement }) => {
    const page = await openNotifications(canvasElement)
    await userEvent.click(await page.findByRole("button", { name: /Aditi Rao commented on/ }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/requests/request-1"))
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
    await expect(within(canvasElement).getByRole("button", { name: "Notifications, 2 unread" })).toBeVisible()
  },
}
