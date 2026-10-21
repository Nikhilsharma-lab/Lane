import { listProjects } from "@/app/(app)/intake/project-actions"
import { pickUpRequest, setRequestPriority } from "@/app/(app)/requests/[id]/actions"
import { clearIntakeDraft, intakeDraftScope } from "@/lib/intake-draft"
import type { RequestPriority } from "@/lib/request-constants"
import type { StoryObj } from "@storybook/nextjs-vite"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import requestsMeta, { ConsistentToolbarFlyouts, PropertyDetails } from "./requests.stories"
import { textContrast, controlContrast, resolvedStyle } from "./helpers/rendered-colours"
import { Button } from "@/components/arc/button/button"
import { Badge } from "@/components/arc/badge/badge"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Alert } from "@/components/arc/alert/alert"
import { RequestsWorkspaceLoading } from "@/app/(app)/requests-workspace-loading"
import AppError from "@/app/(app)/error"
import { LinearRequestsFixture, revalidateLinearPreview } from "./helpers/linear-requests-fixture"
import { announcer, queryRequestGroup, requestGroup, requestRow, requestRows } from "./helpers/request-grid"

const meta = {
  ...requestsMeta,
  title: "Review/Linear primitives",
  parameters: { ...requestsMeta.parameters, fullShell: true },
  beforeEach: () => {
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] })
    // The production row actions run against Storybook's mocked server actions.
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(setRequestPriority).mockReset().mockImplementation(async (_id, priority) => ({ success: true as const, priority: priority as RequestPriority }))
    getRouter().refresh.mockClear()
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
    expect(document.documentElement).toHaveAttribute("data-visual-system", "lane")
    expect(document.documentElement).not.toHaveAttribute("data-color-system")
    const main = canvas.getByRole("main")
    expect(getComputedStyle(main).borderRadius).toBe("16px")
    expect(textContrast(main)).toBeGreaterThanOrEqual(4.5)
    expect(requestGroup(context.canvasElement, "Open Requests")).toBeVisible()
    for (const icon of canvasElementIdentityControls(context.canvasElement)) {
      expect(controlContrast(icon, getComputedStyle(icon).color), icon.getAttribute("aria-label") ?? "Row icon").toBeGreaterThanOrEqual(3)
    }
    // Avatars stay level with the compact metadata badges beside them (supabase-tokens.md, "Composition stays Lane's").
    // Since 2026-10-16 those badges take Supabase's vertical padding with Lane's line height, so the shared
    // height is the rendered badge box, never shorter than Supabase's 17px badge.
    const badgeHeights = [...context.canvasElement.querySelectorAll('[data-request-id] [class*="_badge_"]')].map(badge => badge.getBoundingClientRect().height).filter(Boolean)
    for (const avatar of context.canvasElement.querySelectorAll('[data-avatar-tone]')) {
      expect(textContrast(avatar)).toBeGreaterThanOrEqual(4.5)
      expect(avatar.getBoundingClientRect().height).toBeCloseTo(Number.parseFloat(resolvedStyle(avatar, "height", "var(--request-avatar-size)")), 1)
      const { width, height } = avatar.getBoundingClientRect()
      expect(height).toBeGreaterThanOrEqual(17)
      expect(Math.abs(width - height)).toBeLessThan(0.1)
      for (const badgeHeight of badgeHeights) expect(Math.abs(height - badgeHeight)).toBeLessThan(0.1)
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
    expect(document.documentElement).toHaveAttribute("data-visual-system", "lane")
    const canvas = within(canvasElement)
    const rows = requestRows(requestGroup(canvasElement, "Open Requests"))
    await userEvent.click(within(rows[0]).getByRole("checkbox"))
    await userEvent.click(within(rows[1]).getByRole("checkbox"))
    await userEvent.unhover(within(rows[1]).getByRole("checkbox"))
    expect(canvas.getByRole("toolbar", { name: "Selected Requests" })).toBeVisible()
    expect(getComputedStyle(rows[0]).borderBottomLeftRadius).toBe("0px")
    expect(getComputedStyle(rows[1]).borderTopLeftRadius).toBe("0px")
    expect(rows[1].getBoundingClientRect().top).toBe(rows[0].getBoundingClientRect().bottom)
    const metadata = '[class*="_badge_"], button[data-property="pickedUpBy"] > span'
    for (const row of rows.slice(0, 2)) {
      const badgeHeight = Number.parseFloat(resolvedStyle(row, "height", "var(--badge-sm-height)"))
      await waitFor(() => {
        const pills = [...row.querySelectorAll(metadata)].filter(element => element.getBoundingClientRect().width)
        // One compact height for every pill and the picker avatar: the rendered badge box, never shorter than Supabase's 17px badge.
        expect(badgeHeight).toBeGreaterThanOrEqual(17)
        for (const pill of pills) {
          expect(getComputedStyle(pill).backgroundColor).toBe(getComputedStyle(row).backgroundColor)
          expect(getComputedStyle(pill).borderTopWidth).toBe("1px")
          expect(textContrast(pill)).toBeGreaterThanOrEqual(4.5)
          expect(pill.getBoundingClientRect().height).toBeCloseTo(badgeHeight, 1)
        }
      })
      expect(textContrast(within(row).getByRole("link"))).toBeGreaterThanOrEqual(4.5)
      expect(row.getBoundingClientRect().height).toBe(44)
    }
  },
}

export const Deselected: Story = {
  play: async ({ canvasElement }) => {
    const rows = requestRows(requestGroup(canvasElement, "Open Requests"))
    const grid = within(canvasElement).getByRole("treegrid")
    const box = within(rows[0]).getByRole("checkbox")
    await userEvent.click(box)
    await userEvent.click(box)
    await userEvent.unhover(box)
    expect(rows[0]).not.toHaveAttribute("data-selected")
    expect(rows[0]).toHaveAttribute("aria-selected", "false")
    expect(getComputedStyle(rows[0]).backgroundColor).toBe(getComputedStyle(rows[1]).backgroundColor)
    // Plan item 2.4: the row is the list's one tab stop, so Tab leaves the grid and Shift+Tab comes back to the row.
    await userEvent.tab()
    expect(grid.contains(document.activeElement)).toBe(false)
    await userEvent.tab({ shift: true })
    expect(rows[0]).toHaveFocus()
    // Keyboard focus draws Arc's shared outline on the row; the glyphs inside are not tab stops.
    expect(getComputedStyle(rows[0]).outlineStyle).toBe("solid")
    // Arc's ring is 2px; the reduced-motion browser context reports 3px, so the check is a floor.
    expect(Number.parseFloat(getComputedStyle(rows[0]).outlineWidth)).toBeGreaterThanOrEqual(2)
    expect(within(rows[0]).getByRole("button", { name: "Priority: No priority" })).toHaveAttribute("tabindex", "-1")
  },
}
export const SeparateSelections: Story = {
  play: async ({ canvasElement }) => {
    const rows = requestRows(requestGroup(canvasElement, "Open Requests"))
    await userEvent.click(within(rows[0]).getByRole("checkbox"))
    await userEvent.click(within(rows[2]).getByRole("checkbox"))
    expect(getComputedStyle(rows[0]).borderBottomLeftRadius).toBe(resolvedStyle(rows[0], "border-radius", "var(--request-row-radius)"))
    expect(getComputedStyle(rows[2]).borderTopLeftRadius).toBe(resolvedStyle(rows[0], "border-radius", "var(--request-row-radius)"))
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
    expect(style.borderRadius).toBe(resolvedStyle(panel, "border-radius", "var(--radius-panel)"))
    // Filter panels use the shared Popover material.
    expect(style.boxShadow).toBe(resolvedStyle(panel, "box-shadow", "var(--popover-shadow)"))
    expect(style.getPropertyValue("--foreground")).toBe(getComputedStyle(document.documentElement).getPropertyValue("--sb-foreground"))
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
    const input = await canvas.findByRole("combobox", { name: "Search workspace" })
    await userEvent.type(input, "checkout")
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(canvas.getByRole("option", { name: /Customers cannot find the delivery date/ })).toBeVisible())
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
export const PropertyMenus: Story = { args: PropertyDetails.args, play: async ({ canvasElement, args }) => {
  const row = canvasElement.querySelector<HTMLElement>('[data-request-id]')!
  await userEvent.pointer({ target: within(row).getByRole("link"), keys: "[MouseRight]" })
  const page = within(document.body)
  // The production menu: the one lifecycle move, the saved properties, Copy, then the two row keys it stands in for. Nothing it cannot save.
  const menu = await page.findByRole("menu", { name: "Request LAN-1" })
  await waitFor(() => { for (const name of ["Pick up", "Status", "Priority", "Copy", "Select", "Open Request"]) expect(within(menu).getByRole("menuitem", { name })).toBeVisible() })
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(6)
  await userEvent.click(within(menu).getByRole("menuitem", { name: "Priority" }))
  await userEvent.click(await page.findByRole("menuitemcheckbox", { name: "Urgent" }))
  await waitFor(() => expect(mocked(setRequestPriority)).toHaveBeenCalledWith(row.dataset.requestId, "urgent", args.context))
  await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent("Priority set to urgent."))
  await waitFor(() => expect(page.queryAllByRole("menu")).toHaveLength(0))
} }
export const Empty: Story = { args: { requests: [] } }
export const StatusChips: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    // The status row also holds an inert, aria-hidden measurement copy of the chips; query only the visible group.
    const group = () => canvas.getByRole("group", { name: "Status views" })
    // The row measures itself on mount and folds the views that do not fit: chips that fold out leave through
    // Arc's exit animation (aria-hidden while they go) and the "N more" label swaps in. Read the settled row.
    // Views that do not fit fold into a "N more" menu; the current view always stays a chip.
    let folded = 0
    await waitFor(() => {
      expect(group().querySelector('[data-chip][aria-hidden="true"]')).toBeNull()
      const more = canvas.queryByRole("button", { name: /^\d more$/ })
      folded = more ? Number(/\d+/.exec(more.textContent ?? "")?.[0]) : 0
      expect(group().querySelectorAll("[data-chip]").length + folded).toBe(4)
    })
    async function choose(name: string) {
      const chip = within(group()).queryByRole("button", { name })
      if (chip) { await userEvent.click(chip); return }
      await userEvent.click(canvas.getByRole("button", { name: /^\d more$/ }))
      await userEvent.click(await page.findByRole("menuitem", { name }))
    }
    await choose("Open")
    await waitFor(() => expect(within(group()).getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true"))
    await waitFor(() => expect(queryRequestGroup(canvasElement, "Done Requests")).not.toBeInTheDocument())
    await userEvent.click(within(group()).getByRole("button", { name: "Open" }))
    await waitFor(() => expect(within(group()).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true"))
    await waitFor(() => expect(requestGroup(canvasElement, "Done Requests")).toBeVisible())
    if (folded) return
    within(group()).getByRole("button", { name: "Open" }).focus()
    await userEvent.keyboard("{ArrowRight}{Enter}")
    expect(within(group()).getByRole("button", { name: "In Progress" })).toHaveAttribute("aria-pressed", "true")
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
    expect(requestGroup(canvasElement, "Open Requests")).toBeVisible()
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
    // Only the Open group offers the plus: a new Request always starts Open.
    for (const status of ["In Progress", "Done"]) {
      expect(within(requestGroup(canvasElement, `${status} Requests`)).queryByRole("link", { name: "New Request" })).not.toBeInTheDocument()
    }
    // Plan item 2.4: the plus is not a tab stop (C does the same); focus it as a pointer or script would.
    const trigger = within(requestGroup(canvasElement, "Open Requests")).getByRole("link", { name: "New Request" })
    expect(trigger).toHaveAttribute("tabindex", "-1")
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const dialog = await page.findByRole("dialog", { name: "New Request" })
    // The composer dialog only fades under reduced motion, so the title is visible once it settles.
    const title = await within(dialog).findByLabelText("Request title", {}, { timeout: 5000 })
    await waitFor(() => expect(title).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(canvas.getByRole("button", { name: "Collapse Open group" })).toHaveAttribute("aria-expanded", "true")
  },
}
export const ListSummary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole("button", { name: "Open list summary" })
    const grid = canvas.getByRole("treegrid")
    const listWidth = grid.getBoundingClientRect().width
    const opened = performance.now()
    await userEvent.click(toggle)
    // Under reduced motion it only fades in, so it is checked for visibility once settled, below.
    const summary = canvas.getByRole("region", { name: "List summary" })
    // Plan item 2.4: the summary overlays the list. The list keeps its width, and only transform and opacity move.
    const animated = new Set<string>()
    const widths = new Set<number>()
    let settledAt = 0
    while (performance.now() - opened < 600) {
      widths.add(Math.round(grid.getBoundingClientRect().width))
      for (const animation of canvasElement.getAnimations({ subtree: true })) {
        if (!(animation.effect instanceof KeyframeEffect) || !summary.parentElement!.contains(animation.effect.target as Node)) continue
        for (const frame of animation.effect.getKeyframes()) for (const key of Object.keys(frame)) if (!["offset", "computedOffset", "easing", "composite"].includes(key)) animated.add(key)
      }
      const transform = getComputedStyle(summary).transform
      if (!settledAt && (transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)")) settledAt = performance.now()
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
    if (innerWidth > 760) expect([...widths]).toEqual([Math.round(listWidth)])
    for (const key of animated) expect(["transform", "opacity"]).toContain(key)
    // Settles within the 240 ms panel budget, give or take a frame of the test's own clock.
    expect(settledAt - opened).toBeLessThanOrEqual(240 + 50)
    await waitFor(() => expect(summary).toBeVisible())
    await waitFor(() => expect(summary).toHaveFocus())
    expect(within(summary).getByText("12 matching Requests")).toBeVisible()
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Status: Open, 4 Requests" }))
    await waitFor(() => expect(canvasElement.querySelector('[role="rowgroup"][aria-label="In Progress Requests"]')).not.toBeInTheDocument())
    expect(canvasElement.querySelector('[role="rowgroup"][aria-label="Open Requests"]')).toBeInTheDocument()
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Status: Open, 4 Requests" }))
    await waitFor(() => expect(canvasElement.querySelector('[role="rowgroup"][aria-label="In Progress Requests"]')).toBeInTheDocument())
    await userEvent.click(within(summary).getByRole("button", { name: "Project" }))
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Project: Website, 3 Requests" }))
    await waitFor(() => expect(within(summary).getByText("3 matching Requests")).toBeVisible())
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Project: Website, 3 Requests" }))
    await waitFor(() => expect(within(summary).getByText("12 matching Requests")).toBeVisible())
    await userEvent.click(within(summary).getByRole("button", { name: "Labels" }))
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Labels: Improvement, 4 Requests" }))
    await waitFor(() => expect(within(summary).getByText("4 matching Requests")).toBeVisible())
    await userEvent.click(within(summary).getByRole("button", { name: "Filter Labels: Improvement, 4 Requests" }))
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
    expect(requestGroup(canvasElement, "Open Requests")).toBeVisible()
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
    const row = requestRows(canvasElement)[0]
    const title = within(row).getByRole("link")
    expect(getComputedStyle(title).whiteSpace).toBe("nowrap")
    expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
    expect(row.getBoundingClientRect().height).toBe(44)
    expect(within(row).getByRole("button", { name: "Assignee: Unassigned" })).toBeVisible()
    const width = row.closest('[role="treegrid"], [role="grid"]')!.getBoundingClientRect().width
    const project = row.querySelector('[data-property="project"]')!
    if (width <= 640) expect(project).not.toBeVisible()
    else expect(project).toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth)
  },
}

/**
 * Sketch reservation (2026-10-11 creation-to-outcome sketch, plan item 2.4): a
 * later trailing token ("Result due 14 Dec") must fit beside the widest row's
 * properties at 1440 without shrinking them, and stay hidden on phones. The
 * token here is test-only and removed afterwards; no production UI renders it.
 */
export const TrailingTokenRoom: Story = {
  args: { requests: [{ ...requestsMeta.args.requests[1], requestType: "new_feature" as const, projectId: "11111111-1111-4111-8111-111111111111", projectName: "Customer onboarding and activation", assignedTo: "person-sam", assigneeName: "Alexandria Long Workspace Member Name" }] },
  play: async ({ canvasElement }) => {
    await document.fonts.ready
    const row = requestRows(canvasElement)[0]
    const container = row.querySelector<HTMLElement>("[data-row-property]")!.parentElement!
    const properties = [...container.children] as HTMLElement[]
    const before = properties.map(span => span.getBoundingClientRect().width)
    const token = document.createElement("span")
    token.dataset.rowProperty = "waiting"
    token.textContent = "Result due 14 Dec"
    Object.assign(token.style, { fontSize: "var(--text-xs)", whiteSpace: "nowrap", color: "var(--text-secondary)" })
    container.append(token)
    try {
      if (container.closest("[data-request-grid]")!.getBoundingClientRect().width <= 640) {
        expect(getComputedStyle(token).display).toBe("none")
        return
      }
      if (innerWidth < 1440) return
      properties.forEach((span, index) => expect(span.getBoundingClientRect().width, span.dataset.rowProperty).toBeGreaterThanOrEqual(before[index] - .5))
      expect(token.scrollWidth).toBeLessThanOrEqual(token.clientWidth)
      expect(token.getBoundingClientRect().width).toBeGreaterThan(0)
      expect(row.getBoundingClientRect().height).toBe(44)
      const title = within(row).getByRole("link")
      expect(getComputedStyle(title).whiteSpace).toBe("nowrap")
      expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(44)
    } finally { token.remove() }
  },
}

export const RowContextMenu: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(document.body)
    // Each mocked action saves its change into the preview, so the refreshed list shows what the server would.
    mocked(setRequestPriority).mockImplementation(async (id, priority) => {
      revalidateLinearPreview(id, { priority: priority as RequestPriority })
      return { success: true as const, priority: priority as RequestPriority }
    })
    mocked(pickUpRequest).mockImplementation(async id => {
      revalidateLinearPreview(id, { status: "in_progress", assignedTo: "person-alex", assigneeName: "Alex Morgan" })
      return { success: true }
    })
    const row = canvasElement.querySelector<HTMLElement>('[data-request-id="fixture-1"]')!
    // The code is the saved number, not a display position.
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
    await waitFor(() => expect(mocked(setRequestPriority)).toHaveBeenCalledWith("fixture-1", "high", args.context))
    await waitFor(() => expect(within(row).getByRole("button", { name: "Priority: High" })).toBeVisible())
    // The revalidated render is the only render: a successful action never
    // refreshes the router a second time (plan item 1.3).
    expect(getRouter().refresh).not.toHaveBeenCalled()
    // Plan item 2.4: the row is the tab stop; Shift+F10 on it opens the same menu.
    row.focus()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    await userEvent.click(within(await page.findByRole("menu", { name: "Request LAN-1" })).getByRole("menuitem", { name: "Status" }))
    // Only the next lifecycle step is offered; it names its verb.
    expect(await page.findByRole("menuitemcheckbox", { name: "Done" })).toBeDisabled()
    await userEvent.click(page.getByRole("menuitemcheckbox", { name: "In Progress (pick up)" }))
    await waitFor(() => expect(page.queryAllByRole("menu")).toHaveLength(0))
    await waitFor(() => expect(mocked(pickUpRequest)).toHaveBeenCalledWith("fixture-1", args.context))
    await waitFor(() => expect(requestGroup(canvasElement, "In Progress Requests").querySelector('[data-request-id="fixture-1"]')).not.toBeNull())
    expect(getRouter().refresh).not.toHaveBeenCalled()
    // Focus follows the row into its new group (the row remounts there).
    await waitFor(() => expect(requestRow(canvasElement, "fixture-1")).toHaveFocus())
    expect(announcer(canvasElement)).toHaveTextContent("Picked up. The Request is now In Progress.")
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
    // Supabase's palette is applied pixel-exact (decision 2026-10-13), so status text and
    // checkbox outlines are not held to the AA contrast floor here.
    const primary = canvas.getByRole("button", { name: "Create Request" })
    primary.focus()
    await waitFor(() => expect(primary.getAnimations({ subtree: true }).some(animation => animation.playState === "running")).toBe(false))
    expect(textContrast(primary), "Primary keyboard focus text").toBeGreaterThanOrEqual(4.5)
  },
}

export const DoneRowsHidePriority: Story = {
  args: { requests: meta.args.requests.map(request => ({ ...request, status: 'done' as const, priority: 'high' as const })) },
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll('[data-request-id]')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.querySelector('button[data-priority]')).toBeNull()
  },
}
