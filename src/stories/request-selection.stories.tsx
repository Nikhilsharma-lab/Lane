import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { RequestsOverview } from "@/app/(app)/requests-overview"
import { pickUpRequest, markDone } from "@/app/(app)/requests/[id]/actions"
import { RequestListViewProvider } from "@/components/requests/list-view-state"
import { SidebarView } from "@/components/shell/sidebar-view"
import type { OverviewRequest } from "@/lib/request-overview"

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
  decorators: [(Story) => <RequestListViewProvider><SidebarView workspaceName="Lane Studio" fullName="Alex Morgan" email="alex@example.com" role="admin" statusFilter="all" notifications={null} projects={[{ id: requests[0].projectId!, name: "Website", description: null }]} pathname="/"><Story /></SidebarView></RequestListViewProvider>],
  beforeEach: () => {
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    getRouter().push.mockClear()
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
    await expect(getComputedStyle(bar).boxShadow).toBe("none")
  },
}

export const KeyboardAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` })
    checkbox.focus()
    await userEvent.keyboard(" ")
    await expect(checkbox).toBeChecked()
    await userEvent.click(canvas.getByRole("button", { name: "Select all on this page" }))
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(5)
    await userEvent.keyboard("{Escape}")
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
    await expect(checkbox).toHaveFocus()
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
    mocked(pickUpRequest).mockResolvedValueOnce({ success: true }).mockRejectedValueOnce(new Error("Network lost"))
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getAllByRole("checkbox")[1])
    await userEvent.click(canvas.getByRole("button", { name: "Pick up selected Requests" }))
    await waitFor(() => expect(mocked(pickUpRequest)).toHaveBeenCalledTimes(2))
    await expect(mocked(pickUpRequest)).toHaveBeenNthCalledWith(1, requests[0].id, context)
    await expect(mocked(pickUpRequest)).toHaveBeenNthCalledWith(2, requests[1].id, context)
    await expect(await canvas.findByRole("alert")).toHaveTextContent("1 Request could not be updated. It is still selected. Try again.")
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(1)
    await userEvent.click(canvas.getByRole("button", { name: "Pick up selected Requests" }))
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
    await expect(mocked(pickUpRequest)).toHaveBeenCalledTimes(3)
  },
}

export const Guest: Story = {
  args: { isGuest: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await expect(canvas.queryByRole("button", { name: "Pick up selected Requests" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Copy links" })).toBeVisible()
  },
}

export const PageAndGroupScope: Story = {
  args: { requests },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getByRole("button", { name: "Select all on this page" }))
    await expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(25)
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
    await expect(canvas.queryAllByRole("checkbox", { checked: true })).toHaveLength(0)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    await userEvent.click(canvas.getByRole("button", { name: "Collapse Open group" }))
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
  },
}

let finishPending: ((value: { success: boolean }) => void) | undefined
export const PendingPreventsDuplicates: Story = {
  beforeEach: () => { mocked(pickUpRequest).mockImplementationOnce(() => new Promise(resolve => { finishPending = resolve })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole("checkbox")[0])
    const action = canvas.getByRole("button", { name: "Pick up selected Requests" })
    await userEvent.dblClick(action)
    await expect(mocked(pickUpRequest)).toHaveBeenCalledTimes(1)
    await expect(action).toHaveAttribute("aria-disabled", "true")
    await expect(canvas.getAllByRole("checkbox")[0]).toBeDisabled()
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("toolbar", { name: "Selected Requests" })).toBeVisible()
    finishPending?.({ success: true })
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
    await userEvent.click(canvas.getByRole("button", { name: "Mark selected Requests Done" }))
    await waitFor(() => expect(mocked(markDone)).toHaveBeenCalledWith(requests[26].id, context))
    await expect(mocked(pickUpRequest)).not.toHaveBeenCalled()
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
  },
}
