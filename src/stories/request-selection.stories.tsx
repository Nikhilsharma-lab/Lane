import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { RequestsOverview } from "@/app/(app)/requests-overview"
import { markDoneMany, pickUpRequests } from "@/app/(app)/requests/[id]/actions"
import { RequestListViewProvider } from "@/components/requests/list-view-state"
import { WorkspaceSidebarFixture } from "./helpers/workspace-sidebar-fixture"
import type { OverviewRequest } from "@/lib/request-overview"
import { announcer, requestRows } from "./helpers/request-grid"

const requests: OverviewRequest[] = Array.from({ length: 28 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  title: ["Customers cannot find delivery dates", "Members lose their draft", "New teammates cannot join the workspace"][index % 3] + (index > 2 ? ` · ${index + 1}` : ""),
  reframedProblem: null, status: index < 26 ? "open" : "in_progress",
  createdAt: "2026-10-08T09:00:00.000Z", creatorName: "Alex Morgan",
  assigneeName: index < 26 ? null : "Sam Lee", assignedTo: index < 26 ? null : "sam",
  projectId: "11111111-1111-4111-8111-111111111111", projectName: "Website",
}))
const context = { orgId: "org_storybook" }

const meta = {
  title: "Patterns/Request selection", component: RequestsOverview,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/", query: {} } } },
  args: { requests: [...requests.slice(0, 3), ...requests.slice(26)], filter: "all", isGuest: false, context },
  decorators: [(Story, { args }) => <RequestListViewProvider><WorkspaceSidebarFixture role={args.isGuest ? "guest" : "admin"} projects={[{ id: requests[0].projectId!, name: "Website", description: null }]} requests={args.requests} pathname="/"><Story /></WorkspaceSidebarFixture></RequestListViewProvider>],
  beforeEach: () => {
    // Plan item 1.6: one statement moves every selected row.
    mocked(pickUpRequests).mockReset().mockImplementation(async ids => ({ moved: ids, failed: [] }))
    mocked(markDoneMany).mockReset().mockImplementation(async ids => ({ moved: ids, failed: [] }))
    getRouter().push.mockClear()
    getRouter().refresh.mockClear()
  },
} satisfies Meta<typeof RequestsOverview>
export default meta
type Story = StoryObj<typeof meta>

export const Selected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` }))
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[1].title}` }))
    const bar = await canvas.findByRole("toolbar", { name: "Selected Requests" })
    await expect(within(bar).getByText("2 selected")).toBeVisible()
    await expect(getRouter().push).not.toHaveBeenCalled()
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(2)
    await expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(bar.getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    // A contiguous selection rounds only its outside corners.
    const selectedRows = requestRows(canvasElement).filter(row => row.hasAttribute("data-selected"))
    const firstStyle = getComputedStyle(selectedRows[0])
    const lastStyle = getComputedStyle(selectedRows[1])
    await expect(parseFloat(firstStyle.borderTopLeftRadius)).toBeGreaterThan(0)
    await expect(firstStyle.borderBottomLeftRadius).toBe("0px")
    await expect(lastStyle.borderTopLeftRadius).toBe("0px")
    await expect(parseFloat(lastStyle.borderBottomLeftRadius)).toBeGreaterThan(0)
    // Floating bars carry Supabase's shadow-lg.
    await expect(getComputedStyle(bar).boxShadow).toBe("rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px")
  },
}

export const KeyboardAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` })
    checkbox.focus()
    await userEvent.keyboard(" ")
    await expect(checkbox).toBeChecked()
    await userEvent.click(canvas.getByRole("button", { name: "Select all on page" }))
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(5)
    await userEvent.keyboard("{Escape}")
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
    await expect(checkbox).toHaveFocus()
  },
}

/** Plan item 2.4: X on the focused row selects it, the same as its checkbox; Esc clears. */
export const SelectWithX: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const [first, second] = requestRows(canvasElement)
    first.focus()
    await userEvent.keyboard("x")
    await expect(first).toHaveAttribute("aria-selected", "true")
    await expect(within(first).getByRole("checkbox")).toBeChecked()
    await expect(announcer(canvasElement)).toHaveTextContent("1 Request selected.")
    await userEvent.keyboard("j")
    await waitFor(() => expect(second).toHaveFocus())
    await userEvent.keyboard("x")
    await expect(within(await canvas.findByRole("toolbar", { name: "Selected Requests" })).getByText("2 selected")).toBeVisible()
    await userEvent.keyboard("x")
    await expect(second).toHaveAttribute("aria-selected", "false")
    await userEvent.keyboard("{Escape}")
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
    await expect(first).toHaveAttribute("aria-selected", "false")
    await expect(announcer(canvasElement)).toHaveTextContent("Selection cleared.")
    // Focus stays on the row the person moved to, not the one the selection started on.
    await expect(second).toHaveFocus()
  },
}

export const FilterClearsSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getByRole("button", { name: "Filter Requests by title" }))
    const input = await within(document.body).findByRole("searchbox", { name: "Filter Requests by title" })
    await userEvent.type(input, "draft")
    await userEvent.keyboard("{Escape}")
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole("checkbox")).toHaveLength(1)
    await expect(canvas.getAllByRole("checkbox")[0]).not.toBeChecked()
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-motion-pop-id]')).toHaveLength(0))
  },
}

export const PartialFailure: Story = {
  beforeEach: () => {
    mocked(pickUpRequests).mockResolvedValueOnce({
      moved: [requests[0].id],
      failed: [{ id: requests[1].id, error: "This Request is no longer Open. Refresh to see its current state." }],
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getAllByRole("checkbox")[1])
    await userEvent.click(canvas.getByRole("button", { name: "Pick up" }))
    await waitFor(() => expect(mocked(pickUpRequests)).toHaveBeenCalledTimes(1))
    await expect(mocked(pickUpRequests)).toHaveBeenCalledWith([requests[0].id, requests[1].id], context)
    await expect(await canvas.findByRole("alert")).toHaveTextContent("1 Request could not be updated. It is still selected. Try again.")
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(1)
    // A batch with a failure re-syncs the view once, since the rows it did
    // not move were not revalidated (plan item 1.3).
    await expect(getRouter().refresh).toHaveBeenCalledTimes(1)
    await userEvent.click(canvas.getByRole("button", { name: "Pick up" }))
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
    await expect(mocked(pickUpRequests)).toHaveBeenCalledTimes(2)
    await expect(mocked(pickUpRequests)).toHaveBeenLastCalledWith([requests[1].id], context)
    // The retry succeeded and revalidated itself, so no further refresh.
    await expect(getRouter().refresh).toHaveBeenCalledTimes(1)
  },
}

export const Guest: Story = {
  args: { isGuest: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await expect(canvas.queryByRole("button", { name: "Pick up" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Copy links" })).toBeVisible()
    await expect(mocked(pickUpRequests)).not.toHaveBeenCalled()
    await expect(mocked(markDoneMany)).not.toHaveBeenCalled()
  },
}

export const PageAndGroupScope: Story = {
  args: { requests },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getByRole("button", { name: "Select all on page" }))
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(25)
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
    await expect(canvas.queryAllByRole("checkbox", { checked: true })).toHaveLength(0)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getByRole("button", { name: "Collapse Open group" }))
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
  },
}

let finishPending: (() => void) | undefined
export const PendingPreventsDuplicates: Story = {
  beforeEach: () => {
    finishPending = undefined
    mocked(pickUpRequests).mockImplementationOnce(ids => new Promise(resolve => {
      finishPending = () => resolve({ moved: ids, failed: [] })
    }))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    const action = canvas.getByRole("button", { name: "Pick up" })
    await userEvent.dblClick(action)
    await expect(mocked(pickUpRequests)).toHaveBeenCalledTimes(1)
    await expect(mocked(pickUpRequests)).toHaveBeenCalledWith([requests[0].id], context)
    await expect(action).toHaveAttribute("aria-disabled", "true")
    await expect(canvas.getAllByRole("checkbox")[0]).toBeDisabled()
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("toolbar", { name: "Selected Requests" })).toBeVisible()
    finishPending?.()
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
  },
}

export const CopyFailureAndRetry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const clipboard = navigator.clipboard
    const writeText = fn().mockRejectedValueOnce(new Error("Clipboard unavailable")).mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
      await userEvent.click(canvas.getAllByRole("checkbox")[0])
      await userEvent.click(canvas.getByRole("button", { name: "Copy links" }))
      await expect(await canvas.findByRole("alert")).toHaveTextContent("Links could not be copied. Try again.")
      await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(1)
      await userEvent.click(canvas.getByRole("button", { name: "Copy links" }))
      await expect(await canvas.findByRole("button", { name: "Links copied" })).toBeVisible()
      await expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/requests/${requests[0].id}`)
      await userEvent.click(canvas.getByRole("button", { name: "Clear selection" }))
    } finally { Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard }) }
  },
}

export const ScrollableSelection: Story = {
  args: { requests },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    const bar = canvas.getByRole("toolbar", { name: "Selected Requests" })
    const main = canvas.getByRole("main")
    const bounds = bar.getBoundingClientRect()
    await expect(bounds.bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom)
    await expect(bounds.top).toBeGreaterThan(main.getBoundingClientRect().top)
    await expect(bounds.left).toBeGreaterThan(main.getBoundingClientRect().left)
    await expect(bounds.right).toBeLessThan(main.getBoundingClientRect().right)
    const last = canvas.getAllByRole("checkbox").at(-1)!
    last.scrollIntoView({ block: "end" })
    await expect(bar).toBeVisible()
    await expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(bar.getBoundingClientRect().top)
  },
}

export const CompleteInProgress: Story = {
  args: { requests: requests.slice(26) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getByRole("button", { name: "Mark Done" }))
    await waitFor(() => expect(mocked(markDoneMany)).toHaveBeenCalledWith([requests[26].id], context))
    await expect(mocked(pickUpRequests)).not.toHaveBeenCalled()
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
    // The batch revalidated the list itself; success never refreshes it again.
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  },
}
