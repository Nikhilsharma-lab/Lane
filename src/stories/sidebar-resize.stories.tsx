import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { SidebarView } from "@/components/shell/sidebar-view"
import { Input } from "@/components/arc/input/input"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"

const meta = {
  title: "Navigation/Sidebar resizing",
  component: SidebarView,
  parameters: { layout: "fullscreen" },
  args: {
    workspaceName: "Lane Studio", fullName: "Alex Morgan", email: "alex@example.test", role: "member",
    pathname: "/settings/profile", statusFilter: "all", projects: [], notifications: null,
    children: <div className="p-6"><Input label="Notes" placeholder="Type here" /></div>,
  },
} satisfies Meta<typeof SidebarView>
export default meta
type Story = StoryObj<typeof meta>

async function expectWidth(handle: HTMLElement, sidebar: HTMLElement, width: number) {
  await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", String(width)))
  await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(width))
}

export const KeyboardAndRememberedWidth: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    await expect(handle).toHaveAttribute("aria-orientation", "vertical")
    await expect(handle).toHaveAttribute("aria-valuemin", "0")
    await expect(handle).toHaveAttribute("aria-valuemax", "400")
    await expectWidth(handle, sidebar, 272)
    await expect(canvas.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument()
    handle.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expectWidth(handle, sidebar, 288)
    await userEvent.keyboard("{Home}")
    await expectWidth(handle, sidebar, 0)
    await expect(sidebar).toHaveAttribute("inert")
    const expand = within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" })
    await expect(expand).toBeVisible()
    await userEvent.click(expand)
    await expectWidth(handle, sidebar, 288)
    await expect(sidebar).not.toHaveAttribute("inert")
    await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
    handle.focus()
    await userEvent.keyboard("{Enter}")
    await expectWidth(handle, sidebar, 0)
    handle.focus()
    await userEvent.keyboard("{Enter}")
    await expectWidth(handle, sidebar, 288)
  },
}

export const KeyboardLimits: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    for (const width of [256, 240, 224, 208, 200, 0]) {
      await userEvent.keyboard("{ArrowLeft}")
      await expectWidth(handle, sidebar, width)
    }
    handle.focus()
    await userEvent.keyboard("{End}")
    await expectWidth(handle, sidebar, 400)
    await userEvent.keyboard("{ArrowRight}")
    await expectWidth(handle, sidebar, 400)
  },
}

export const TypingKeepsLayout: Story = {
  args: { children: <div className="grid gap-4 p-6">
    <Input label="Notes" placeholder="Type here" />
    <Dialog><DialogTrigger asChild><Button variant="secondary">Open example dialog</Button></DialogTrigger>
      <DialogContent title="Example dialog" description="Check that a dialog keeps keyboard focus."><p>Sidebar shortcuts stay inactive here.</p></DialogContent>
    </Dialog>
  </div> },
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    const input = canvas.getByRole("textbox", { name: "Notes" })
    await userEvent.type(input, "[BracketLeft]")
    await expect(input).toHaveValue("[")
    await expect(handle).toHaveAttribute("aria-valuenow", "272")
    const account = canvas.getByRole("button", { name: "Account menu, Alex Morgan" })
    await userEvent.click(account)
    await userEvent.keyboard("[BracketLeft]")
    await expect(handle).toHaveAttribute("aria-valuenow", "272")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument())
    await userEvent.click(canvas.getByRole("button", { name: "Open example dialog" }))
    const dialog = await within(document.body).findByRole("dialog", { name: "Example dialog" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard("[BracketLeft]")
    await expect(handle).toHaveAttribute("aria-valuenow", "272")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Example dialog" })).not.toBeInTheDocument())
  },
}

export const MobileDrawerUnchanged: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth > 640) return
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("separator", { name: "Resize sidebar" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
    const opener = canvas.getByRole("button", { name: "Open navigation" })
    await userEvent.click(opener)
    const dialog = await within(document.body).findByRole("dialog", { name: "Navigation" })
    await expect(within(dialog).getByRole("button", { name: "Close sidebar" })).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
    await expect(opener).toHaveFocus()
  },
}

export const LinearPreviewResponsiveCollapse: Story = {
  args: { linearPreviewAutoCollapse: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shell = canvasElement.querySelector<HTMLElement>("[data-workspace-shell]")!
    const sidebar = canvasElement.querySelector<HTMLElement>("#lane-sidebar")!
    const handle = canvasElement.querySelector<HTMLElement>('[role="separator"][aria-label="Resize sidebar"]')!

    if (innerWidth > 880) {
      await expectWidth(handle, sidebar, 254)
      await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
      await expect(handle).not.toHaveAttribute("aria-disabled")
      return
    }

    await waitFor(() => expect(sidebar).toHaveAttribute("data-collapsed"))
    await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(0))
    await expect(handle).toHaveAttribute("aria-valuenow", "0")
    await expect(handle).toHaveAttribute("aria-disabled", "true")
    await expect(canvas.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument()
    await expect(getComputedStyle(shell).flexDirection).toBe("row")
    await expect(canvas.getByRole("main").getBoundingClientRect().width).toBeGreaterThan(innerWidth - 32)

    const expand = canvas.getByRole("button", { name: "Expand sidebar" })
    expand.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(sidebar).toHaveAttribute("data-peeking"))
    await expect(handle).toHaveAttribute("aria-valuenow", "0")
    await waitFor(() => expect(canvas.getByRole("button", { name: "Account menu, Alex Morgan" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-peeking"))
    await expect(expand).toHaveFocus()
    await userEvent.keyboard("[BracketLeft]")
    await waitFor(() => expect(sidebar).toHaveAttribute("data-peeking"))
    await expect(handle).toHaveAttribute("aria-valuenow", "0")
    await userEvent.keyboard("{Escape}")
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await expect(expand).toHaveFocus()
  },
}

function dragPointer(handle: HTMLElement, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture", x: number, pointerId = 17) {
  // Exercise React's real pointer handlers; capture is only needed by trusted
  // browser drags, since these deliberate test events remain on the handle.
  handle.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: 100 }))
}

export const PointerResizeAndCollapseThreshold: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 370)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "342"))
    dragPointer(handle, "pointerup", 370)
    await expectWidth(handle, sidebar, 342)
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 138)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "200"))
    dragPointer(handle, "pointerup", 138)
    await expectWidth(handle, sidebar, 200)
    dragPointer(handle, "pointerdown", 200)
    dragPointer(handle, "pointermove", 159)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "0"))
    dragPointer(handle, "pointerup", 159)
    await expectWidth(handle, sidebar, 0)
    dragPointer(handle, "pointerdown", 0)
    dragPointer(handle, "pointermove", 232)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "232"))
    dragPointer(handle, "pointerup", 232)
    await expectWidth(handle, sidebar, 232)
    await expect(sidebar).not.toHaveAttribute("inert")
  },
}

export const CancelledDragRestoresWidth: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 410)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "382"))
    dragPointer(handle, "pointercancel", 410)
    await expectWidth(handle, sidebar, 272)
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 150)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "0"))
    await userEvent.keyboard("{Escape}")
    await expectWidth(handle, sidebar, 272)
    handle.focus()
    await userEvent.keyboard("{Home}")
    await expectWidth(handle, sidebar, 0)
    await userEvent.click(within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" }))
    await expectWidth(handle, sidebar, 272)
  },
}

export const SearchCollapseFocus: Story = {
  args: { pathname: "/", children: <div className="p-6"><SidebarExpandButton />Original Requests content</div> },
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }))
    const search = await canvas.findByRole("searchbox", { name: "Search workspace" })
    await waitFor(() => expect(search).toHaveFocus())
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    await userEvent.keyboard("[BracketLeft]")
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "0"))
    const searchPane = canvas.getByRole("region", { name: "Workspace search" })
    const expand = within(searchPane).getByRole("button", { name: "Expand sidebar" })
    await waitFor(() => expect(expand).toHaveFocus())
    await expect(canvasElement.querySelectorAll('button[aria-label="Expand sidebar"]')).toHaveLength(2)
    await userEvent.keyboard("{Escape}")
    const requestsExpand = canvas.getByRole("button", { name: "Expand sidebar" })
    await waitFor(() => expect(requestsExpand).toHaveFocus())
    await expect(requestsExpand).not.toBe(expand)
  },
}

export const DragDuringAnimationKeepsVisibleWidth: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640 || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    await userEvent.keyboard("{End}")
    let visibleWidth = 0
    await waitFor(() => {
      visibleWidth = sidebar.getBoundingClientRect().width
      expect(visibleWidth).toBeGreaterThan(280)
      expect(visibleWidth).toBeLessThan(370)
    })
    // Measure in the same task as pointerdown, without an assertion's await
    // allowing the spring to advance between the observation and the grab.
    visibleWidth = sidebar.getBoundingClientRect().width
    dragPointer(handle, "pointerdown", 300)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await expect(Math.abs(sidebar.getBoundingClientRect().width - visibleWidth)).toBeLessThan(2)
    dragPointer(handle, "pointermove", 312)
    await waitFor(() => expect(Math.abs(Number(handle.getAttribute("aria-valuenow")) - (visibleWidth + 12))).toBeLessThan(2))
    dragPointer(handle, "pointercancel", 312)
    await expectWidth(handle, sidebar, 400)
  },
}

export const UnrelatedPointerCannotEndDrag: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    dragPointer(handle, "pointerdown", 300)
    for (const [event, x, expected] of [
      ["pointerup", 340, 312], ["pointercancel", 360, 332], ["lostpointercapture", 380, 352],
    ] as const) {
      dragPointer(handle, event, x, 99)
      dragPointer(handle, "pointermove", x)
      await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", String(expected)))
    }
    dragPointer(handle, "pointerup", 380)
    await expectWidth(handle, sidebar, 352)
  },
}
