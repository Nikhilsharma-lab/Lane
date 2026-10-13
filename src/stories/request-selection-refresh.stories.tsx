import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { RequestsOverview } from "@/app/(app)/requests-overview"
import { markDoneMany, pickUpRequests } from "@/app/(app)/requests/[id]/actions"
import { RequestListViewProvider, useRequestListView } from "@/components/requests/list-view-state"
import type { OverviewRequest, RequestGrouping } from "@/lib/request-overview"

const context = { orgId: "org_storybook" }
const requests: OverviewRequest[] = [
  { id: "10000000-0000-4000-8000-000000000001", title: "Customers cannot find delivery dates", reframedProblem: null, status: "open", createdAt: "2026-10-08T09:00:00.000Z", creatorName: "Alex Morgan", assignedTo: null, assigneeName: null },
  { id: "10000000-0000-4000-8000-000000000002", title: "Members lose their draft", reframedProblem: null, status: "open", createdAt: "2026-10-08T09:00:00.000Z", creatorName: "Alex Morgan", assignedTo: null, assigneeName: null },
]

// Re-render the production list as a server-action revalidation would. No test
// controls or server-response branches are added to the product component.
let replaceRows: Dispatch<SetStateAction<OverviewRequest[]>> | undefined
function RefreshFixture({ grouping = "status" }: { grouping?: RequestGrouping }) {
  const [rows, setRows] = useState(requests)
  const [, setView] = useRequestListView()
  useEffect(() => {
    replaceRows = setRows
    // The status view stays the list view state's, read from the URL once (plan item 1.7).
    setView(previous => ({ ...previous, grouping }))
    return () => { replaceRows = undefined }
  }, [grouping, setView])
  return <RequestsOverview requests={rows} isGuest={false} context={context} />
}

const picked = (row: OverviewRequest): OverviewRequest => ({ ...row, status: "in_progress", assignedTo: "picker-sam", assigneeName: "Sam Lee" })
const meta = {
  title: "Patterns/Request selection/Refresh",
  component: RefreshFixture,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/", query: {} } } },
  decorators: [(Story) => <RequestListViewProvider><Story /></RequestListViewProvider>],
  beforeEach: () => {
    replaceRows = undefined
    // Plan item 1.6: one statement moves every selected row.
    mocked(pickUpRequests).mockReset().mockImplementation(async ids => ({ moved: ids, failed: [] }))
    mocked(markDoneMany).mockReset().mockImplementation(async ids => ({ moved: ids, failed: [] }))
    getRouter().refresh.mockClear()
  },
} satisfies Meta<typeof RefreshFixture>
export default meta
type Story = StoryObj<typeof meta>

export const PendingActionSurvivesRowRefresh: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    let finishBatch: (() => void) | undefined
    mocked(pickUpRequests).mockImplementationOnce(ids => new Promise(resolve => {
      // An incoming server snapshot can change a row before our batch returns.
      replaceRows?.(rows => rows.map(row => row.id === requests[0].id ? picked(row) : row))
      finishBatch = () => {
        replaceRows?.(rows => rows.map(picked))
        resolve({ moved: ids, failed: [] })
      }
    }))
    await waitFor(() => expect(replaceRows).toBeDefined())
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` }))
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[1].title}` }))
    const action = canvas.getByRole("button", { name: "Pick up" })
    action.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(finishBatch).toBeDefined())
    await expect(mocked(pickUpRequests)).toHaveBeenCalledTimes(1)
    await expect(mocked(pickUpRequests)).toHaveBeenCalledWith(requests.map(row => row.id), context)
    // The incoming snapshot changes one row's status. The action being performed
    // must retain its identity and keyboard focus until the batch completes.
    await expect(action).toBeInTheDocument()
    await expect(action).toHaveAttribute("aria-disabled", "true")
    await expect(action).toHaveFocus()
    // Plan item 2.4: the list's one polite region carries the selection announcement.
    await expect(canvasElement.querySelector('[data-slot="list-announcer"]')).toHaveTextContent("Working on 2 selected Requests.")
    await expect(canvas.queryByRole("button", { name: "Mark Done" })).not.toBeInTheDocument()
    finishBatch?.()
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
    // Status grouping remounts the original row, so focus needs a stable list
    // fallback instead of trying to focus its detached checkbox: the grid's
    // tab stop (plan item 2.4).
    await waitFor(() => expect(canvasElement.querySelector('[role="row"][tabindex="0"]')).toHaveFocus())
    // The batch revalidated the list itself; a batch with no failures
    // never refreshes the router a second time (plan item 1.3).
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  },
}

export const FailedRequestLeavesFilteredView: Story = {
  // The Open view comes from the list view state, which reads the URL once (plan item 1.7).
  parameters: { nextjs: { navigation: { pathname: "/", query: { status: "open" } } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(replaceRows).toBeDefined())
    mocked(pickUpRequests).mockImplementationOnce(async () => {
      // Another teammate picked the first Request; our pickup moves the
      // second, and revalidation removes both from the Open view.
      replaceRows?.(rows => rows.map(picked))
      return { moved: [requests[1].id], failed: [{ id: requests[0].id, error: "This Request is no longer Open. Refresh to see its current state." }] }
    })
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` }))
    await userEvent.click(canvas.getByRole("checkbox", { name: `Select ${requests[1].title}` }))
    await userEvent.click(canvas.getByRole("button", { name: "Pick up" }))
    await waitFor(() => expect(canvas.queryAllByRole("checkbox")).toHaveLength(0))
    const error = await canvas.findByRole("alert")
    await expect(error).toBeVisible()
    await expect(error).toHaveTextContent("1 Request could not be updated")
    await expect(error).toHaveTextContent("no longer Open")
    // The failed row did not revalidate, so the view re-syncs once.
    await expect(getRouter().refresh).toHaveBeenCalledTimes(1)
  },
}

export const SuccessRestoresEnabledCheckbox: Story = {
  args: { grouping: "none" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(replaceRows).toBeDefined())
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Collapse Open group" })).not.toBeInTheDocument())
    mocked(pickUpRequests).mockImplementationOnce(async ids => {
      replaceRows?.(rows => rows.map(row => row.id === requests[0].id ? picked(row) : row))
      return { moved: ids, failed: [] }
    })
    const checkbox = canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` })
    checkbox.focus()
    await userEvent.keyboard(" ")
    const action = canvas.getByRole("button", { name: "Pick up" })
    action.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument())
    await expect(checkbox).not.toBeDisabled()
    await expect(checkbox).not.toBeChecked()
    await waitFor(() => expect(checkbox).toHaveFocus())
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  },
}
