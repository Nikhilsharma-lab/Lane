import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useState } from "react"
import { Circle, CircleCheck, CircleDot, Copy } from "lucide-react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { ContextMenu, type ContextMenuItem } from "@/components/arc/context-menu/context-menu"

function NestedMenuFixture() {
  const [status, setStatus] = useState("Open")
  const [message, setMessage] = useState("")
  const items: ContextMenuItem[] = [
    { id: "status", label: "Status", icon: <CircleDot size={15} />, shortcut: "S", children: [
      { id: "unavailable", label: "Unavailable status", disabled: true },
      ...[{ label: "Open", icon: Circle }, { label: "In Progress", icon: CircleDot }, { label: "Done", icon: CircleCheck }].map(({ label, icon: Icon }) => ({ id: label, label, checked: status === label, icon: <Icon size={15} />, onSelect: () => setStatus(label) })),
    ] },
    { id: "copy", label: "Copy title", icon: <Copy size={15} />, separatorBefore: true, onSelect: () => setMessage("Title copied") },
  ]
  return <main style={{ padding: 24 }}>
    <ContextMenu asChild openOnClick={false} label="Request actions" items={items}>
      <button type="button">Request row</button>
    </ContextMenu>
    <button type="button">Next control</button>
    <p role="status">{message || `Current status: ${status}`}</p>
  </main>
}

const meta = { title: "Patterns/Context menu nested", component: NestedMenuFixture, parameters: { layout: "fullscreen" } } satisfies Meta<typeof NestedMenuFixture>
export default meta
type Story = StoryObj<typeof meta>

async function openFromKeyboard(canvasElement: HTMLElement) {
  const trigger = within(canvasElement).getByRole("button", { name: "Request row" })
  trigger.focus()
  await userEvent.keyboard("{Shift>}{F10}{/Shift}")
  const page = within(document.body)
  const menu = await page.findByRole("menu", { name: "Request actions" })
  await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Status" })).toHaveFocus())
  return { page, trigger, menu }
}

export const KeyboardSubmenuAndCheckedChoice: Story = {
  play: async ({ canvasElement }) => {
    const { page, trigger, menu } = await openFromKeyboard(canvasElement)
    const status = within(menu).getByRole("menuitem", { name: "Status" })
    expect(status).toHaveAttribute("aria-haspopup", "menu")
    await userEvent.keyboard("{ArrowRight}")
    const submenu = await page.findByRole("menu", { name: "Status" })
    const open = within(submenu).getByRole("menuitemcheckbox", { name: "Open" })
    expect(open).toHaveAttribute("aria-checked", "true")
    await waitFor(() => expect(open).toHaveFocus())
    await userEvent.keyboard("{ArrowLeft}")
    await waitFor(() => expect(status).toHaveFocus())
    expect(status).toHaveAttribute("aria-expanded", "false")
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => expect(page.getByRole("menuitemcheckbox", { name: "Open" })).toHaveFocus())
    await userEvent.keyboard("{ArrowDown}{Enter}")
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    expect(within(canvasElement).getByRole("status")).toHaveTextContent("Current status: In Progress")
    expect(trigger).toHaveFocus()
  },
}

export const EscapeBackAndRootFocus: Story = {
  play: async ({ canvasElement }) => {
    const { page, trigger, menu } = await openFromKeyboard(canvasElement)
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => expect(page.getByRole("menuitemcheckbox", { name: "Open" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Status" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  },
}

export const PointerSubmenusStayInsideViewport: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Request row" })
    trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: window.innerWidth - 1, clientY: window.innerHeight - 1 }))
    const page = within(document.body)
    const root = await page.findByRole("menu", { name: "Request actions" })
    const status = within(root).getByRole("menuitem", { name: "Status" })
    await userEvent.hover(status)
    const submenu = await page.findByRole("menu", { name: "Status" })
    await waitFor(() => {
      const box = submenu.getBoundingClientRect()
      expect(box.left).toBeGreaterThanOrEqual(7)
      expect(box.top).toBeGreaterThanOrEqual(7)
      expect(box.right).toBeLessThanOrEqual(window.innerWidth - 7)
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight - 7)
    })
    const back = within(submenu).queryByRole("menuitem", { name: "Back to Request actions" })
    if (window.innerWidth < 440) {
      await waitFor(() => expect(back).toBeVisible())
      await userEvent.click(back!)
      await waitFor(() => expect(status).toBeVisible())
      await userEvent.click(status)
    }
    await userEvent.click(page.getByRole("menuitemcheckbox", { name: "Done" }))
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    expect(within(canvasElement).getByRole("status")).toHaveTextContent("Current status: Done")
    expect(trigger).toHaveFocus()
  },
}

export const SeparatorAndTabDismissal: Story = {
  play: async ({ canvasElement }) => {
    const { page, trigger, menu } = await openFromKeyboard(canvasElement)
    await waitFor(() => expect(within(menu).getByRole("separator")).toBeVisible())
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => expect(page.getByRole("menuitemcheckbox", { name: "Open" })).toHaveFocus())
    await userEvent.keyboard("{Tab}")
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    await userEvent.tab()
    expect(within(canvasElement).getByRole("button", { name: "Next control" })).toHaveFocus()
  },
}

export const RowWrapperReturnsToOriginalControl: Story = {
  render: () => <ul><ContextMenu asChild openOnClick={false} label="Row actions" items={[{ id: "copy", label: "Copy link" }]}>
    <li><button type="button">Select Request</button><a href="#request">Request title</a></li>
  </ContextMenu></ul>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const control = canvas.getByRole("link", { name: "Request title" })
    control.focus()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    const page = within(document.body)
    await waitFor(() => expect(page.getByRole("menuitem", { name: "Copy link" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(control).toHaveFocus())
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
  },
}

export const InnerMenuDoesNotOpenOuterRowMenu: Story = {
  render: () => <ContextMenu asChild openOnClick={false} label="Outer Request actions" items={[{ id: "copy", label: "Copy Request" }]}>
    <div tabIndex={-1}>
      <ContextMenu asChild label="Priority choices" items={[{ id: "urgent", label: "Urgent", checked: false }, { id: "high", label: "High", checked: true }]}>
        <button type="button">Change priority</button>
      </ContextMenu>
    </div>
  </ContextMenu>,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Change priority" })
    const page = within(document.body)
    await userEvent.click(trigger)
    const menu = await page.findByRole("menu", { name: "Priority choices" })
    const urgent = within(menu).getByRole("menuitemcheckbox", { name: "Urgent" })
    await waitFor(() => expect(urgent).toHaveFocus())
    const contextEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })
    urgent.dispatchEvent(contextEvent)
    expect(contextEvent.defaultPrevented).toBe(true)
    expect(page.queryByRole("menu", { name: "Outer Request actions" })).not.toBeInTheDocument()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    expect(page.queryByRole("menu", { name: "Outer Request actions" })).not.toBeInTheDocument()
    expect(page.getAllByRole("menu")).toHaveLength(1)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  },
}
