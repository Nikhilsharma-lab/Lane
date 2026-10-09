import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { RequestsOverview } from "@/app/(app)/requests-overview"
import { markDone, pickUpRequest } from "@/app/(app)/requests/[id]/actions"
import { RequestListViewProvider, useRequestListView } from "@/components/requests/list-view-state"
import type { OverviewRequest, RequestGrouping } from "@/lib/request-overview"
import type { RequestStatusFilter } from "@/lib/request-workspace"

const context = { orgId: "org_storybook" }
const requests: OverviewRequest[] = [
  { id: "10000000-0000-4000-8000-000000000001", title: "Customers cannot find delivery dates", reframedProblem: null, status: "open", createdAt: "2026-10-08T09:00:00.000Z", creatorName: "Alex Morgan", assignedTo: null, assigneeName: null },
  { id: "10000000-0000-4000-8000-000000000002", title: "Members lose their draft", reframedProblem: null, status: "open", createdAt: "2026-10-08T09:00:00.000Z", creatorName: "Alex Morgan", assignedTo: null, assigneeName: null },
]

// Re-render the production list as a server-action revalidation would. No test
// controls or server-response branches are added to the product component.
let replaceRows: Dispatch<SetStateAction<OverviewRequest[]>> | undefined
function RefreshFixture({ filter = "all", grouping = "status" }: { filter?: RequestStatusFilter; grouping?: RequestGrouping }) {
  const [rows, setRows] = useState(requests)
  const [, setView] = useRequestListView()
  useEffect(() => {
    replaceRows = setRows
    setView(previous => ({ ...previous, grouping }))
    return () => { replaceRows = undefined }
  }, [grouping, setView])
  return <RequestsOverview requests={rows} filter={filter} isGuest={false} context={context} />
}

const picked = (row: OverviewRequest): OverviewRequest => ({ ...row, status: "in_progress", assignedTo: "picker-sam", assigneeName: "Sam Lee" })
const meta = {
  title: "Patterns/Request selection/Refresh",
  component: RefreshFixture,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/", query: {} } } },
  decorators: [(Story) => <RequestListViewProvider><Story /></RequestListViewProvider>],
  beforeEach: () => {
    replaceRows = undefined
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    getRouter().refresh.mockClear()
  },
} satisfies Meta<typeof RefreshFixture>
export default meta
type Story = StoryObj<typeof meta>

export const PendingActionSurvivesRowRefresh: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    let finishSecond: (() => void) | undefined
    mocked(pickUpRequest)
      .mockImplementationOnce(async () => {
        replaceRows?.(rows => rows.map(row => row.id === requests[0].id ? picked(row) : row))
        return { success: true }
      })
      .mockImplementationOnce(() => new Promise(resolve => {
        finishSecond = () => {
          replaceRows?.(rows => rows.map(picked))
          resolve({ success: true })
        }
      }))
    await waitFor(() => expect(replaceRows).toBeDefined())
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` }))
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[1].title}` }))
    const action = canvas.getByRole("button", { name: "Pick up selected Requests" })
    action.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(finishSecond).toBeDefined())
    // The first result changes one row's status. The action being performed
    // must retain its identity and keyboard focus until the batch completes.
    await expect(action).toBeInTheDocument()
    await expect(action).toHaveAttribute("aria-disabled", "true")
    await expect(action).toHaveFocus()
    await expect(canvas.getByRole("status")).toHaveTextContent("2 selected Requests")
    await expect(canvas.queryByRole("button", { name: "Mark selected Requests Done" })).not.toBeInTheDocument()
    finishSecond?.()
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
    // Status grouping remounts the original row, so focus needs a stable list
    // fallback instead of trying to focus its detached checkbox.
    await waitFor(() => expect(canvas.getByRole("button", { name: "Filter Requests by title" })).toHaveFocus())
  },
}

export const FailedRequestLeavesFilteredView: Story = {
  args: { filter: "open" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(replaceRows).toBeDefined())
    mocked(pickUpRequest)
      .mockResolvedValueOnce({ error: "This Request is no longer Open. Refresh to see its current state." })
      .mockImplementationOnce(async () => {
        // Another teammate picked the first Request; our second pickup
        // succeeds and revalidation removes both from the Open filter.
        replaceRows?.(rows => rows.map(picked))
        return { success: true }
      })
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` }))
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[1].title}` }))
    await userEvent.click(canvas.getByRole("button", { name: "Pick up selected Requests" }))
    await waitFor(() => expect(canvas.queryAllByRole("checkbox")).toHaveLength(0))
    const error = await canvas.findByRole("alert")
    await expect(error).toBeVisible()
    await expect(error).toHaveTextContent("1 Request could not be updated")
    await expect(error).toHaveTextContent("no longer Open")
  },
}

export const SuccessRestoresEnabledCheckbox: Story = {
  args: { grouping: "none" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(replaceRows).toBeDefined())
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Collapse Open group" })).not.toBeInTheDocument())
    mocked(pickUpRequest).mockImplementationOnce(async () => {
      replaceRows?.(rows => rows.map(row => row.id === requests[0].id ? picked(row) : row))
      return { success: true }
    })
    const checkbox = canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` })
    checkbox.focus()
    await userEvent.keyboard(" ")
    const action = canvas.getByRole("button", { name: "Pick up selected Requests" })
    action.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
    await expect(checkbox).not.toBeDisabled()
    await expect(checkbox).not.toBeChecked()
    await waitFor(() => expect(checkbox).toHaveFocus())
  },
}
