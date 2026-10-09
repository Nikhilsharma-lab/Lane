import { listProjects } from "@/app/(app)/intake/project-actions"
import { clearIntakeDraft, intakeDraftScope } from "@/lib/intake-draft"
import type { StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import requestsMeta, { ConsistentToolbarFlyouts, PropertyDetails } from "./requests.stories"
import { textContrast, controlContrast } from "./helpers/rendered-colours"
import { Button } from "@/components/arc/button/button"
import { Badge } from "@/components/arc/badge/badge"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Alert } from "@/components/arc/alert/alert"
import { RequestsWorkspaceLoading } from "@/app/(app)/requests-workspace-loading"
import AppError from "@/app/(app)/error"
import { LinearRequestsFixture } from "./helpers/linear-requests-fixture"

const meta = {
  ...requestsMeta,
  title: "Review/Linear primitives",
  parameters: { ...requestsMeta.parameters, fullShell: true, visualSystem: "linear" },
  beforeEach: () => {
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] })
    clearIntakeDraft(window.sessionStorage, intakeDraftScope("linear-preview-person", "org_storybook"))
  },
  args: { ...requestsMeta.args, requests: requestsMeta.args.requests.slice(0, 12), context: { orgId: "org_storybook" } },
  render: (args: React.ComponentProps<typeof LinearRequestsFixture>) => <LinearRequestsFixture {...args} />,
}
export default meta
type Story = StoryObj<typeof meta>

export const Requests: Story = {
  play: async context => {
    const canvas = within(context.canvasElement)
    expect(document.documentElement).toHaveAttribute("data-visual-system", "linear")
    expect(document.documentElement).not.toHaveAttribute("data-color-system")
    const main = canvas.getByRole("main")
    expect(getComputedStyle(main).borderRadius).toBe("12px")
    expect(textContrast(main)).toBeGreaterThanOrEqual(4.5)
    expect(canvas.getByRole("list", { name: "Open Requests" })).toBeVisible()
    for (const icon of canvasElementIdentityControls(context.canvasElement)) {
      expect(controlContrast(icon, getComputedStyle(icon).color), icon.getAttribute("aria-label") ?? "Row icon").toBeGreaterThanOrEqual(3)
    }
    for (const avatar of context.canvasElement.querySelectorAll('[data-avatar-tone]')) {
      expect(textContrast(avatar)).toBeGreaterThanOrEqual(4.5)
      expect(avatar.getBoundingClientRect().height).toBe(24)
    }
    if (innerWidth > 880) {
      const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
      expect(getComputedStyle(main).backgroundColor).not.toBe(getComputedStyle(sidebar.parentElement!).backgroundColor)
    } else expect(canvas.getByRole("button", { name: "Expand sidebar" })).toBeVisible()
  },
}

function canvasElementIdentityControls(canvasElement: HTMLElement) {
  return canvasElement.querySelectorAll<HTMLButtonElement>('button[data-priority], button[data-status]')
}

export const Selected: Story = {
  play: async ({ canvasElement }) => {
    expect(document.documentElement).toHaveAttribute("data-visual-system", "linear")
    const canvas = within(canvasElement)
    const rows = within(canvas.getByRole("list", { name: "Open Requests" })).getAllByRole("listitem")
    await userEvent.click(within(rows[0]).getByRole("checkbox"))
    await userEvent.click(within(rows[1]).getByRole("checkbox"))
    await userEvent.unhover(within(rows[1]).getByRole("checkbox"))
    expect(canvas.getByRole("toolbar", { name: "Selected Requests" })).toBeVisible()
    expect(getComputedStyle(rows[0]).borderBottomLeftRadius).toBe("0px")
    expect(getComputedStyle(rows[1]).borderTopLeftRadius).toBe("0px")
    expect(rows[1].getBoundingClientRect().top).toBe(rows[0].getBoundingClientRect().bottom)
    const metadata = '[class*="_badge_"], button[data-property="pickedUpBy"] > span'
    for (const row of rows.slice(0, 2)) {
      await waitFor(() => {
        for (const pill of [...row.querySelectorAll(metadata)].filter(element => element.getBoundingClientRect().width)) {
          expect(getComputedStyle(pill).backgroundColor).toBe(getComputedStyle(row).backgroundColor)
          expect(getComputedStyle(pill).borderTopWidth).toBe("1px")
          expect(controlContrast(pill, getComputedStyle(pill).borderTopColor)).toBeGreaterThanOrEqual(3)
          expect(textContrast(pill)).toBeGreaterThanOrEqual(4.5)
          expect(pill.getBoundingClientRect().height).toBe(24)
        }
      })
      expect(textContrast(within(row).getByRole("link"))).toBeGreaterThanOrEqual(4.5)
      expect(row.getBoundingClientRect().height).toBe(44)
    }
  },
}

export const Deselected: Story = {
  play: async ({ canvasElement }) => {
    const rows = within(within(canvasElement).getByRole("list", { name: "Open Requests" })).getAllByRole("listitem")
    const box = within(rows[0]).getByRole("checkbox")
    await userEvent.click(box)
    await userEvent.click(box)
    await userEvent.unhover(box)
    expect(rows[0]).not.toHaveAttribute("data-selected")
    expect(getComputedStyle(rows[0]).backgroundColor).toBe(getComputedStyle(rows[1]).backgroundColor)
    await userEvent.tab()
    const priority = within(rows[0]).getByRole("button", { name: "Priority: No priority" })
    expect(priority).toHaveFocus()
    expect(getComputedStyle(priority).backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
  },
}
export const SeparateSelections: Story = {
  play: async ({ canvasElement }) => {
    const rows = within(within(canvasElement).getByRole("list", { name: "Open Requests" })).getAllByRole("listitem")
    await userEvent.click(within(rows[0]).getByRole("checkbox"))
    await userEvent.click(within(rows[2]).getByRole("checkbox"))
    expect(getComputedStyle(rows[0]).borderBottomLeftRadius).toBe("8px")
    expect(getComputedStyle(rows[2]).borderTopLeftRadius).toBe("8px")
  },
}
export const ToolbarMenus: Story = {
  play: async context => {
    await ConsistentToolbarFlyouts.play?.(context)
    const canvas = within(context.canvasElement)
    const page = within(document.body)
    await userEvent.click(canvas.getByRole("button", { name: "Add filter" }))
    const panel = await page.findByRole("dialog", { name: "Add filter" })
    const style = getComputedStyle(panel)
    expect(style.borderRadius).toBe("12px")
    expect(style.boxShadow).toBe("none")
    expect(style.getPropertyValue("--foreground")).toBe(getComputedStyle(document.documentElement).getPropertyValue("--linear-menu-label-base"))
    for (const item of within(panel).getAllByRole("menuitem")) expect(textContrast(item)).toBeGreaterThanOrEqual(4.5)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add filter" })).toHaveFocus())
  },
}
async function revealSidebar(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const expand = canvas.queryByRole("button", { name: "Expand sidebar" })
  if (expand) { await userEvent.click(expand); await waitFor(() => expect(canvas.getByRole("button", { name: "Account menu, Alex Morgan" })).toBeVisible()) }
}
export const Search: Story = {
  play: async ({ canvasElement }) => {
    await revealSidebar(canvasElement)
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }))
    const input = await canvas.findByRole("searchbox", { name: "Search workspace" })
    await userEvent.type(input, "checkout")
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(canvas.getByRole("link", { name: /Customers cannot find the delivery date/ })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(input).not.toBeVisible())
  },
}
export const SidebarPeek: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    if (innerWidth > 880) {
      canvas.getByRole("separator", { name: "Resize sidebar" }).focus()
      await userEvent.keyboard("{Home}")
    }
    if (innerWidth > 880) await userEvent.hover(canvas.getByRole("button", { name: "Expand sidebar" }))
    else await revealSidebar(canvasElement)
    const sidebar = canvasElement.querySelector('[data-peeking]')!
    expect(sidebar).not.toBeNull()
    expect(getComputedStyle(sidebar.firstElementChild!).borderTopLeftRadius).toBe("0px")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(canvasElement.querySelector('[data-peeking]')).toBeNull())
  },
}
export const AccountMenu: Story = {
  play: async ({ canvasElement }) => {
    await revealSidebar(canvasElement)
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Account menu, Alex Morgan" }))
    const menu = await within(document.body).findByRole("menu")
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Settings" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(menu).not.toBeInTheDocument())
  },
}
export const PropertyMenus: Story = { args: PropertyDetails.args, play: async ({ canvasElement }) => {
  const row = canvasElement.querySelector<HTMLElement>('[data-request-id]')!
  await userEvent.pointer({ target: within(row).getByRole("link"), keys: "[MouseRight]" })
  const page = within(document.body)
  await userEvent.click(await page.findByRole("menuitem", { name: "Picker" }))
  await userEvent.click(await page.findByRole("menuitemcheckbox", { name: "Sam Lee" }))
  await waitFor(() => expect(within(row).getByRole("button", { name: "Owner: Sam Lee" })).toBeVisible())
  await waitFor(() => expect(page.queryAllByRole("menu")).toHaveLength(0))
} }
export const Empty: Story = { args: { requests: [] } }
export const StatusChips: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const group = canvas.getByRole("group", { name: "Request status" })
    expect(group.querySelectorAll("[data-chip]")).toHaveLength(4)
    const open = within(group).getByRole("button", { name: "Open" })
    await userEvent.click(open)
    expect(open).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(canvas.queryByRole("list", { name: "Done Requests" })).not.toBeInTheDocument())
    await userEvent.click(open)
    expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(canvas.getByRole("list", { name: "Done Requests" })).toBeVisible())
    open.focus()
    await userEvent.keyboard("{ArrowRight}{Enter}")
    expect(within(group).getByRole("button", { name: "In Progress" })).toHaveAttribute("aria-pressed", "true")
  },
}
export const DrawerLayout: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole("button", { name: "Open list summary" })
    await userEvent.click(toggle)
    const summary = canvas.getByRole("region", { name: "List summary" })
    const main = canvas.getByRole("main")
    await waitFor(() => {
      const panel = summary.getBoundingClientRect()
      expect(panel.bottom).toBeGreaterThan(main.getBoundingClientRect().bottom - 16)
      expect(panel.right).toBeLessThanOrEqual(main.getBoundingClientRect().right)
      expect(panel.top).toBeGreaterThanOrEqual(canvasElement.querySelector('[data-slot="requests-toolbar"]')!.getBoundingClientRect().bottom)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth)
    })
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(summary).not.toBeInTheDocument())
    expect(toggle).toHaveFocus()
    await userEvent.click(toggle)
    await userEvent.click(toggle)
    await waitFor(() => expect(canvas.queryByRole("region", { name: "List summary" })).not.toBeInTheDocument())
    expect(canvas.getByRole("list", { name: "Open Requests" })).toBeVisible()
    await userEvent.click(toggle)
    await userEvent.click(toggle)
    await userEvent.click(toggle)
    await waitFor(() => expect(canvas.getByRole("region", { name: "List summary" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(canvas.queryByRole("region", { name: "List summary" })).not.toBeInTheDocument())
  },
}
export const GroupComposer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    for (const status of ["Open", "In Progress", "Done"]) {
      const trigger = canvas.getByRole("link", { name: `New Request from ${status} group` })
      trigger.focus()
      await userEvent.keyboard("{Enter}")
      const dialog = await page.findByRole("dialog", { name: "New Request" })
      expect(await within(dialog).findByLabelText("Request title", {}, { timeout: 5000 })).toBeVisible()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(dialog).not.toBeInTheDocument())
      await waitFor(() => expect(trigger).toHaveFocus())
      expect(canvas.getByRole("button", { name: `Collapse ${status} group` })).toHaveAttribute("aria-expanded", "true")
    }
  },
}
export const ListSummary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole("button", { name: "Open list summary" })
    await userEvent.click(toggle)
    const summary = canvas.getByRole("region", { name: "List summary" })
    expect(summary).toBeVisible()
    await waitFor(() => expect(summary).toHaveFocus())
    expect(within(summary).getByText("12 matching Requests")).toBeVisible()
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Status: Open, 4 Requests" }))
    await waitFor(() => expect(canvasElement.querySelector('ul[aria-label="In Progress Requests"]')).not.toBeInTheDocument())
    expect(canvasElement.querySelector('ul[aria-label="Open Requests"]')).toBeInTheDocument()
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Status: Open, 4 Requests" }))
    await waitFor(() => expect(canvasElement.querySelector('ul[aria-label="In Progress Requests"]')).toBeInTheDocument())
    await userEvent.click(within(summary).getByRole("button", { name: "Project" }))
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Project: Website, 3 Requests" }))
    await waitFor(() => expect(within(summary).getByText("3 matching Requests")).toBeVisible())
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Project: Website, 3 Requests" }))
    await waitFor(() => expect(within(summary).getByText("12 matching Requests")).toBeVisible())
    await userEvent.click(within(summary).getByRole("button", { name: "Request type" }))
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Request type: Improvement, 4 Requests" }))
    await waitFor(() => expect(within(summary).getByText("4 matching Requests")).toBeVisible())
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Request type: Improvement, 4 Requests" }))
    await waitFor(() => expect(within(summary).getByText("12 matching Requests")).toBeVisible())
    await userEvent.click(within(summary).getByRole("button", { name: "Close list summary" }))
    await waitFor(() => expect(summary).not.toBeInTheDocument())
    expect(toggle).toHaveFocus()
  },
}
export const DisplayStatus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(canvas.getByRole("button", { name: "Display" }))
    const panel = await page.findByRole("dialog", { name: "Display Requests" })
    await userEvent.click(within(panel).getByRole("button", { name: "Status" }))
    await userEvent.keyboard("{Escape}")
    expect(canvas.queryAllByRole("button", { name: "Status: Open" })).toHaveLength(0)
    expect(canvas.getByRole("list", { name: "Open Requests" })).toBeVisible()
  },
}
export const Loading: Story = { render: () => <RequestsWorkspaceLoading /> }
const retry = fn()
export const LoadError: Story = {
  render: () => <AppError error={new Error("Illustrative load failure")} reset={retry} />,
  beforeEach: () => { retry.mockClear() },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
  },
}
export const LongTitle: Story = { args: { requests: [{ ...requestsMeta.args.requests[0], title: "A customer needs to understand the next step before sharing sensitive information with a teammate in a workspace with several responsibilities and changing priorities" }] } }

export const ResponsiveRows: Story = {
  args: LongTitle.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getAllByRole("listitem").find(item => item.hasAttribute("data-request-id"))!
    const title = within(row).getByRole("link")
    expect(getComputedStyle(title).whiteSpace).toBe("nowrap")
    expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
    expect(row.getBoundingClientRect().height).toBe(44)
    expect(within(row).getByRole("button", { name: "Owner: Unassigned" })).toBeVisible()
    const width = row.closest("ul")!.getBoundingClientRect().width
    const project = row.querySelector('[data-property="project"]')!
    if (width <= 640) expect(project).not.toBeVisible()
    else expect(project).toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth)
  },
}

export const RowContextMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const row = canvasElement.querySelector<HTMLElement>('[data-request-id="fixture-1"]')!
    expect(row.querySelector('[data-request-code]')).toHaveTextContent("LAN-1")
    const title = within(row).getByRole("link")
    const priority = within(row).getByRole("button", { name: "Priority: No priority" })
    const status = within(row).getByRole("button", { name: "Status: Open" })
    expect(priority.getBoundingClientRect().right).toBeLessThanOrEqual(status.getBoundingClientRect().left)
    expect(status.getBoundingClientRect().right).toBeLessThanOrEqual(title.getBoundingClientRect().left)
    await userEvent.pointer({ target: title, keys: "[MouseRight]" })
    const menu = await page.findByRole("menu", { name: "Request LAN-1" })
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Priority" }))
    await userEvent.click(await page.findByRole("menuitemcheckbox", { name: "High" }))
    await waitFor(() => expect(page.queryAllByRole("menu")).toHaveLength(0))
    expect(within(row).getByRole("button", { name: "Priority: high" })).toBeVisible()
    title.focus()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    await userEvent.click(within(await page.findByRole("menu", { name: "Request LAN-1" })).getByRole("menuitem", { name: "Status" }))
    await userEvent.click(await page.findByRole("menuitemcheckbox", { name: "In Progress" }))
    await waitFor(() => expect(page.queryAllByRole("menu")).toHaveLength(0))
    await waitFor(() => expect(canvas.getByRole("list", { name: "In Progress Requests" }).querySelector('[data-request-id="fixture-1"]')).not.toBeNull())
    expect(canvas.getByRole("link", { name: title.textContent! })).toHaveFocus()
  },
}

export const Controls: Story = {
  render: () => <main style={{ background: "var(--surface)", color: "var(--foreground)", padding: "var(--space-6)", display: "grid", gap: "var(--space-4)" }}>
    <h1>Linear primitives</h1>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      <Badge tone="neutral">Open</Badge><Badge tone="info">In Progress</Badge><Badge tone="success">Done</Badge><Badge tone="warning">Needs attention</Badge><Badge tone="danger">Upload failed</Badge>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
      <Button>Create Request</Button><Button variant="secondary">Add link</Button><Button variant="danger">Remove link</Button><Button disabled>Unavailable</Button><Button loading>Saving Request</Button>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}>
      <Checkbox label="Selected" defaultChecked /><Checkbox label="Unselected" /><Checkbox label="Unavailable selection" disabled />
    </div>
    <Alert tone="danger" title="Request could not be updated">Your selection is still here. Try again.</Alert>
  </main>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const element of canvasElement.querySelectorAll('button:not(:disabled):not([aria-busy="true"]), [class*="_badge_"], [role="alert"] strong, [role="alert"] p')) {
      if (element.getAttribute("role") === "checkbox") continue
      expect(textContrast(element), element.textContent ?? "Control text").toBeGreaterThanOrEqual(4.5)
    }
    for (const box of canvas.getAllByRole("checkbox")) {
      if (box.hasAttribute("disabled")) continue
      const square = box.firstElementChild!
      if (box.getAttribute("data-state") === "unchecked") expect(controlContrast(square, getComputedStyle(square).borderTopColor)).toBeGreaterThanOrEqual(3)
    }
    const primary = canvas.getByRole("button", { name: "Create Request" })
    primary.focus()
    await waitFor(() => expect(primary.getAnimations({ subtree: true }).some(animation => animation.playState === "running")).toBe(false))
    expect(textContrast(primary), "Primary keyboard focus text").toBeGreaterThanOrEqual(4.5)
  },
}
