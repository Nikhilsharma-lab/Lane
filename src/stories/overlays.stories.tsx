import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"

const meta = {
  title: "Primitives/Overlays",
  parameters: {
    docs: { description: { component: "Official Arc Dialog, DropdownMenu and Popover. Keyboard checks cover focus containment, Escape dismissal, return focus, and disabled menu actions." } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DialogKeyboard: Story = {
  render: () => <Dialog>
    <DialogTrigger asChild><Button variant="secondary">Review Request</Button></DialogTrigger>
    <DialogContent title="Review the problem" description="Customers cannot find their saved Requests after returning to the workspace.">
      <Button variant="secondary">Keep editing</Button>
    </DialogContent>
  </Dialog>,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Review Request" })
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(trigger)
    const dialog = await page.findByRole("dialog", { name: "Review the problem" })
    await expect(dialog).toHaveAccessibleDescription("Customers cannot find their saved Requests after returning to the workspace.")
    await waitFor(() => expect(dialog.contains(canvasElement.ownerDocument.activeElement)).toBe(true))
    for (let step = 0; step < 3; step += 1) {
      await userEvent.tab()
      await waitFor(() => expect(dialog.contains(canvasElement.ownerDocument.activeElement)).toBe(true))
    }
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}

export const OpenDialogWithLongContent: Story = {
  render: () => <Dialog defaultOpen>
    <DialogTrigger asChild><Button variant="secondary">Review Request</Button></DialogTrigger>
    <DialogContent title="Review the problem before confirming this Request" description="People returning to the workspace cannot tell which Requests changed while they were away. They revisit several details to recover their context. The team needs to understand where this happens before choosing a solution.">
      <p>Review this problem with your teammates before confirming it.</p>
    </DialogContent>
  </Dialog>,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Review the problem before confirming this Request" })
    await Promise.all(dialog.getAnimations().map(animation => animation.finished))
    await waitFor(() => expect(Number(getComputedStyle(dialog).opacity)).toBe(1))
  },
}

export const MenuKeyboardAndSelection: Story = {
  render: function Render() {
    const [visible, setVisible] = useState(true)
    return <div className="space-y-4">
      <DropdownMenu label="Column options" items={[
        { label: visible ? "Hide submitted by" : "Show submitted by", onSelect: () => setVisible(current => !current) },
        { label: "Request title is always visible", disabled: true },
        { label: "Restore column", onSelect: () => setVisible(true), separatorBefore: true },
      ]} />
      <p role="status">Submitted by is {visible ? "visible" : "hidden"}.</p>
    </div>
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Column options" })
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(trigger)
    const menu = await page.findByRole("menu")
    await waitFor(() => expect(menu.contains(canvasElement.ownerDocument.activeElement)).toBe(true))
    await userEvent.keyboard("{Home}{Enter}")
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Submitted by is hidden."))
    await userEvent.click(trigger)
    await expect(await page.findByRole("menuitem", { name: "Request title is always visible" })).toHaveAttribute("aria-disabled", "true")
    await userEvent.keyboard("{End}{Enter}")
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Submitted by is visible."))
    await userEvent.click(trigger)
    await waitFor(() => expect(page.getByRole("menu")).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}

export const PopoverKeyboard: Story = {
  render: () => <Popover>
    <PopoverTrigger asChild><Button variant="secondary">About attachments</Button></PopoverTrigger>
    <PopoverContent aria-label="Private attachments">
      <h2>Private attachments</h2>
      <p>Only people who can access this Request can download its files.</p>
    </PopoverContent>
  </Popover>,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "About attachments" })
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(trigger)
    const dialog = await page.findByRole("dialog", { name: "Private attachments" })
    await waitFor(() => expect(dialog).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 })
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}
