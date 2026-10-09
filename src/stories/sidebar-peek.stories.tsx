import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { useState } from "react"
import { SidebarView } from "@/components/shell/sidebar-view"
import { Input } from "@/components/arc/input/input"
import { NotificationBellView } from "@/components/shell/notification-bell-view"

function NotificationsFixture() {
  const [open, setOpen] = useState(false)
  return <NotificationBellView open={open} onOpenChange={setOpen} unread={0} items={[]} loaded isPending={false} onSelect={fn()} onMarkAllRead={fn()} onToggleRead={fn()} onRetry={fn()} />
}

const meta = {
  title: "Navigation/Sidebar hover preview",
  component: SidebarView,
  parameters: { layout: "fullscreen" },
  args: {
    workspaceName: "Lane Studio", fullName: "Alex Morgan", email: "alex@example.test", role: "member",
    pathname: "/settings/profile", statusFilter: "all", projects: [], notifications: <NotificationsFixture />,
    children: <div className="p-6"><Input label="Notes" placeholder="Page content" /></div>,
  },
} satisfies Meta<typeof SidebarView>
export default meta
type Story = StoryObj<typeof meta>

const allowCloseDelay = () => new Promise<void>(resolve => setTimeout(resolve, 220))

async function collapse(canvasElement: HTMLElement, rememberedWidth = 272) {
  const canvas = within(canvasElement)
  const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
  const resize = canvas.getByRole("separator", { name: "Resize sidebar" })
  resize.focus()
  if (rememberedWidth === 400) {
    await userEvent.keyboard("{End}")
    await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(400))
  }
  await userEvent.keyboard("{Home}")
  // Wait for the spring to settle, rather than rounding its final fractional pixel.
  await waitFor(() => expect(sidebar.getBoundingClientRect().width).toBe(0))
  const expand = within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" })
  return { canvas, sidebar, resize, expand, main: canvas.getByRole("main") }
}

async function expectPeek(sidebar: HTMLElement, expand: HTMLElement, width = 272) {
  await waitFor(() => expect(sidebar).toHaveAttribute("data-peeking", "true"))
  const navigation = within(sidebar).getByRole("navigation", { name: "Primary navigation" })
  const panel = navigation.parentElement!
  await waitFor(() => expect(Math.round(panel.getBoundingClientRect().width)).toBe(width))
  await expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(0)
  await expect(sidebar).not.toHaveAttribute("inert")
  await expect(expand).toHaveAttribute("aria-expanded", "true")
}

export const HoverWithoutLayoutShift: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const { canvas, sidebar, resize, expand, main } = await collapse(canvasElement)
    const before = main.getBoundingClientRect()
    await userEvent.hover(expand)
    await expectPeek(sidebar, expand)
    await expect(canvas.getAllByRole("complementary", { name: "Workspace sidebar" })).toHaveLength(1)
    await expect(canvas.getByRole("complementary", { name: "Workspace sidebar" })).toBe(sidebar)
    await expect(resize).toHaveAttribute("aria-valuenow", "0")
    await expect(main.getBoundingClientRect().left).toBe(before.left)
    await expect(main.getBoundingClientRect().width).toBe(before.width)
    await userEvent.unhover(expand)
    const navigation = within(sidebar).getByRole("navigation", { name: "Primary navigation" })
    await userEvent.hover(navigation)
    await allowCloseDelay()
    await expectPeek(sidebar, expand)
    await userEvent.unhover(navigation)
    // The short delay bridges the gap between the trigger and preview.
    await expect(sidebar).toHaveAttribute("data-peeking", "true")
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-peeking", "true"))
    await expect(sidebar).toHaveAttribute("inert")
    await expect(expand).toHaveAttribute("aria-expanded", "false")
    await expect(main.getBoundingClientRect().width).toBe(before.width)
  },
}

export const HoverPreview: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const { sidebar, resize, expand, main } = await collapse(canvasElement)
    const before = main.getBoundingClientRect()
    await userEvent.hover(expand)
    await expectPeek(sidebar, expand)
    await expect(resize).toHaveAttribute("aria-valuenow", "0")
    await expect(main.getBoundingClientRect().left).toBe(before.left)
    await expect(main.getBoundingClientRect().width).toBe(before.width)
  },
}

export const ClickPinsRememberedWidth: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const { sidebar, resize, expand, main } = await collapse(canvasElement, 400)
    const before = main.getBoundingClientRect()
    await userEvent.hover(expand)
    await expectPeek(sidebar, expand, 400)
    const trigger = expand.getBoundingClientRect()
    const topElement = document.elementFromPoint(trigger.left + trigger.width / 2, trigger.top + trigger.height / 2)
    await expect(topElement?.closest('button[aria-label="Expand sidebar"]')).toBe(expand)
    await userEvent.click(expand)
    await waitFor(() => expect(resize).toHaveAttribute("aria-valuenow", "400"))
    await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(400))
    await expect(sidebar).not.toHaveAttribute("data-peeking", "true")
    await expect(main.getBoundingClientRect().width).toBeLessThan(before.width)
    await userEvent.unhover(within(sidebar).getByRole("navigation", { name: "Primary navigation" }))
    await allowCloseDelay()
    await expect(resize).toHaveAttribute("aria-valuenow", "400")
  },
}

export const AccountMenuKeepsPreview: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const { sidebar, resize, expand } = await collapse(canvasElement)
    await userEvent.hover(expand)
    await expectPeek(sidebar, expand)
    const account = within(sidebar).getByRole("button", { name: "Account menu, Alex Morgan" })
    account.focus()
    await userEvent.unhover(expand)
    await allowCloseDelay()
    await expectPeek(sidebar, expand)
    await userEvent.click(account)
    const page = within(document.body)
    const settings = await page.findByRole("menuitem", { name: "Settings" })
    await userEvent.hover(settings)
    await allowCloseDelay()
    await expectPeek(sidebar, expand)
    await expect(settings).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument())
    await expectPeek(sidebar, expand)
    await expect(account).toHaveFocus()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-peeking", "true"))
    await expect(expand).toHaveFocus()
    await expect(resize).toHaveAttribute("aria-valuenow", "0")
  },
}

export const NotificationPopoverKeepsPreview: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const { canvas, sidebar, expand } = await collapse(canvasElement)
    await userEvent.hover(expand)
    await expectPeek(sidebar, expand)
    const trigger = within(sidebar).getByRole("button", { name: "Notifications" })
    await userEvent.unhover(expand)
    await userEvent.click(trigger)
    const page = within(document.body)
    const notification = await page.findByRole("dialog", { name: "Notifications" })
    const close = within(notification).getByRole("button", { name: "Close notifications" })
    await waitFor(() => expect(close).toHaveFocus())
    await userEvent.hover(close)
    await userEvent.unhover(close)
    await allowCloseDelay()
    await expectPeek(sidebar, expand)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
    await expectPeek(sidebar, expand)
    await expect(trigger).toHaveFocus()
    const notes = canvas.getByRole("textbox", { name: "Notes" })
    notes.focus()
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-peeking", "true"))
  },
}

export const RemovedMenuDoesNotKeepPreviewOpen: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const { canvas, sidebar, expand } = await collapse(canvasElement)
    await userEvent.hover(expand)
    await expectPeek(sidebar, expand)
    await userEvent.unhover(expand)
    await userEvent.click(within(sidebar).getByRole("button", { name: "Account menu, Alex Morgan" }))
    const page = within(document.body)
    const settings = await page.findByRole("menuitem", { name: "Settings" })
    await userEvent.hover(settings)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument())
    await waitFor(() => expect(within(sidebar).getByRole("button", { name: "Account menu, Alex Morgan" })).toHaveFocus())
    canvas.getByRole("textbox", { name: "Notes" }).focus()
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-peeking", "true"))
  },
}

export const EscapeClosesWithoutResizing: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const { sidebar, resize, expand, main } = await collapse(canvasElement)
    const before = main.getBoundingClientRect()
    await userEvent.hover(expand)
    await expectPeek(sidebar, expand)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-peeking", "true"))
    await waitFor(() => expect(expand).toHaveFocus())
    await expect(resize).toHaveAttribute("aria-valuenow", "0")
    await expect(main.getBoundingClientRect().width).toBe(before.width)
  },
}

export const MobileStillUsesDrawer: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth > 640) return
    const canvas = within(canvasElement)
    const page = within(document.body)
    const opener = canvas.getByRole("button", { name: "Open navigation" })
    await userEvent.hover(opener)
    await expect(page.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
    await userEvent.click(opener)
    const navigation = await page.findByRole("dialog", { name: "Navigation" })
    await userEvent.unhover(opener)
    await allowCloseDelay()
    await expect(navigation).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
    await expect(opener).toHaveFocus()
  },
}
