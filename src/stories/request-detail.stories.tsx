import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { RequestDetailView, RequestDetailSkeleton, RequestListPane, RequestUnavailable, type RequestDetail, type RequestListItem } from "@/components/requests/detail-view"
import { SidebarView } from "@/components/shell/sidebar-view"
import { CommentForm } from "@/app/(app)/requests/[id]/comment-form"
import { AttachmentDownload } from "@/app/(app)/requests/[id]/attachment-download"
import { LifecycleButtons } from "@/app/(app)/requests/[id]/lifecycle-buttons"
import { addComment, getAttachmentDownloadUrl, markDone, pickUpRequest } from "@/app/(app)/requests/[id]/actions"
import type { ReactNode } from "react"

const request: RequestDetail = {
  id: "fixture-request", title: "Show a delivery date before checkout", description: "Customers have to begin checkout before they can see when their order will arrive.",
  reframedProblem: "Customers cannot find the delivery date before checkout", extractedSolution: "Show the expected delivery date on the product page.", classification: "hybrid",
  affectedPeople: "Customers comparing products with different delivery dates.", desiredChange: "Know the expected delivery date before starting checkout.", observedEvidence: "Support conversations mention uncertainty about delivery dates.", uncertainty: "We do not yet know how often this prevents a purchase.", usefulLink: "https://example.com/research/delivery",
  status: "open", assignedTo: null, createdBy: "fixture-person", createdAt: new Date("2026-10-01T09:00:00Z"), creatorName: "Alex Morgan", assigneeName: null,
}
const context = { orgId: "fixture-workspace" }
const comments = [{ id: "fixture-comment", body: "Could we compare the product-page and checkout experiences before deciding where this belongs?", createdAt: new Date("2026-10-01T10:00:00Z"), authorName: "Sam Lee" }]
const attachments = [{ id: "fixture-file", fileName: "Delivery context.png", mimeType: "image/png", sizeBytes: 182400, uploadedAt: new Date("2026-10-01T09:00:00Z") }]
const requests: RequestListItem[] = [request, { ...request, id: "fixture-progress", title: "New teammates cannot find the right workspace", reframedProblem: null, status: "in_progress", assigneeName: "Sam Lee" }, { ...request, id: "fixture-done", title: "People lose their draft after an upload fails", reframedProblem: null, status: "done" }]

function Shell({ children, guest = false }: { children: ReactNode; guest?: boolean }) {
  return <SidebarView workspaceName="Lane Studio" fullName="Alex Morgan" email="alex@example.test" role={guest ? "guest" : "member"} pathname="/requests/fixture-request" statusFilter="all" notifications={null} onSignOut={() => {}}>{children}</SidebarView>
}

function Detail({ current = request, guest = false, minimal = false, list = requests }: { current?: RequestDetail; guest?: boolean; minimal?: boolean; list?: RequestListItem[] }) {
  return <Shell guest={guest}><div className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden">
    <RequestListPane requests={list} selectedRequestId={current.id} filter="all" isGuest={guest} />
    <RequestDetailView request={current} comments={minimal ? [] : comments} attachments={minimal ? [] : attachments} filter="all" isGuest={guest}
      lifecycleActions={<LifecycleButtons requestId={current.id} status={current.status} context={context} filter="all" />}
      mobileLifecycleActions={<LifecycleButtons requestId={current.id} status={current.status} context={context} filter="all" fullWidth />}
      commentForm={<CommentForm requestId={current.id} context={context} />}
      attachmentAction={attachment => <AttachmentDownload attachmentId={attachment.id} context={context} />}
    />
  </div></Shell>
}

const meta = {
  title: "Requests/Detail",
  component: Detail,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/requests/fixture-request" } } },
  beforeEach: () => {
    mocked(addComment).mockReset().mockResolvedValue({ success: true })
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    mocked(getAttachmentDownloadUrl).mockReset().mockResolvedValue({ error: "Couldn’t prepare the download. Try again." })
  },
} satisfies Meta<typeof Detail>
export default meta
type Story = StoryObj<typeof meta>

export const Full: Story = {}
export const Minimal: Story = {
  args: { minimal: true, current: { ...request, reframedProblem: null, extractedSolution: null, classification: "problem", affectedPeople: null, desiredChange: null, observedEvidence: null, uncertainty: null, usefulLink: null, expectedImpact: null } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("region", { name: "Expected impact" })).not.toBeInTheDocument()
  },
}
export const Guest: Story = {
  args: { guest: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("button", { name: "Pick up" })).not.toBeInTheDocument()
    await expect(canvas.queryByText("Available for anyone to pick up")).not.toBeInTheDocument()
    await expect(canvas.getByRole("textbox", { name: "Comment" })).toBeVisible()
  },
}
export const InProgress: Story = { args: { current: { ...request, status: "in_progress", assignedTo: "fixture-person-2", assigneeName: "Sam Lee" } } }
export const Done: Story = { args: { current: { ...request, status: "done", assignedTo: "fixture-person-2", assigneeName: "Sam Lee" } } }
export const LongContent: Story = {
  args: { current: { ...request, reframedProblem: "Customers returning to a shared workspace cannot identify which delivery date applies to their selected product when several delivery options have changed since their previous visit", creatorName: "Alexandria Long Workspace Member Name", description: "Long context remains readable without expanding the page horizontally. ".repeat(18), usefulLink: `https://example.com/research/${"delivery-context-".repeat(15)}` } },
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
  },
}
export const Unavailable: Story = { render: () => <Shell><div className="flex min-h-0 flex-1"><RequestListPane requests={requests} selectedRequestId="missing" filter="all" isGuest={false} /><RequestUnavailable returnHref="/" /></div></Shell> }
export const Loading: Story = { render: () => <Shell><RequestDetailSkeleton /></Shell> }
export const LateDoneRequest: Story = {
  render: () => {
    const list = Array.from({ length: 31 }, (_, index) => ({ ...request, id: `done-${index}`, title: `Resolved delivery question ${index + 1}`, reframedProblem: null, status: "done" as const }))
    return <Detail current={{ ...request, ...list[30] }} list={list} />
  },
  play: async ({ canvasElement }) => {
    if (window.innerWidth >= 1024) {
      const list = within(within(canvasElement).getByRole("complementary", { name: "Request list" }))
      await expect(list.getByRole("link", { name: /Resolved delivery question 31/ })).toHaveAttribute("aria-current", "page")
    }
  },
}
export const CommentRetry: Story = {
  beforeEach: () => { mocked(addComment).mockRejectedValueOnce(new Error("Fixture connection interrupted")) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const comment = canvas.getByRole("textbox", { name: "Comment" })
    await userEvent.type(comment, "A question to preserve after a failed save.")
    await userEvent.click(canvas.getByRole("button", { name: "Post comment" }))
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Your draft is still here"))
    await expect(comment).toHaveValue("A question to preserve after a failed save.")
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(comment).toHaveValue(""))
    await expect(canvas.getByText("Comment posted.")).toHaveAttribute("role", "status")
  },
}
export const CommentPending: Story = {
  play: async ({ canvasElement }) => {
    let complete!: (value: { success: boolean }) => void
    mocked(addComment).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("textbox", { name: "Comment" }), "Keep this draft until the save completes.")
    await userEvent.click(canvas.getByRole("button", { name: "Post comment" }))
    await expect(canvas.getByRole("button", { name: "Posting…" })).toBeDisabled()
    await expect(canvas.getByRole("textbox", { name: "Comment" })).toHaveAttribute("readonly")
    complete({ success: true })
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Comment" })).toHaveValue(""))
  },
}
export const LifecycleRetry: Story = {
  beforeEach: () => { mocked(pickUpRequest).mockRejectedValueOnce(new Error("Fixture connection interrupted")) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Pick up" }))
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Couldn’t confirm pickup"))
    await userEvent.click(canvas.getByRole("button", { name: "Pick up" }))
    await waitFor(() => expect(canvas.getByText(/Moved to In Progress/)).toBeVisible())
  },
}


export const ProjectAndRequestType: Story = {
  args: { current: { ...request, projectId: "website", projectName: "Website", requestType: "improvement" } },
  play: async ({ canvasElement }) => {
    const detail = within(within(canvasElement).getByRole("region", { name: `Request detail: ${request.reframedProblem}` }))
    await expect(detail.getByText("Website", { exact: true })).toBeVisible()
    await expect(detail.getByText("Improvement", { exact: true })).toBeVisible()
    await expect(detail.getByText("Project", { exact: true })).toBeVisible()
    await expect(detail.getByText("Request type", { exact: true })).toBeVisible()
  },
}

export const ExpectedMetricImpact: Story = {
  args: { minimal: true, current: { ...request, expectedImpact: { kind: "metric", metric: "Customers finding a saved draft", baseline: null, target: 90, unit: "%", source: "Saved-draft usability check", reviewAfterDays: 14 } } },
  play: async ({ canvasElement }) => {
    const impact = within(await within(canvasElement).findByRole("region", { name: "Expected impact" }))
    await expect(impact.getByText("Customers finding a saved draft")).toBeVisible()
    await expect(impact.getByText("Not measured yet")).toBeVisible()
    await expect(impact.getByText("90 %")).toBeVisible()
    await expect(impact.getByText("Saved-draft usability check")).toBeVisible()
    await expect(impact.getByText("14 days after launch")).toBeVisible()
    await expect(impact.queryByRole("textbox")).not.toBeInTheDocument()
  },
}

export const ExpectedVerifiedImpact: Story = {
  args: { minimal: true, current: { ...request, expectedImpact: { kind: "verification", result: "Customers can reopen an unfinished draft after signing in again.", source: "Verify on the supported browsers with a saved draft.", reviewAfterDays: 1 } } },
  play: async ({ canvasElement }) => {
    const impact = within(await within(canvasElement).findByRole("region", { name: "Expected impact" }))
    await expect(impact.getByText("Customers can reopen an unfinished draft after signing in again.")).toBeVisible()
    await expect(impact.getByText("Verify on the supported browsers with a saved draft.")).toBeVisible()
    await expect(impact.getByText("1 day after launch")).toBeVisible()
    await expect(impact.queryByText("Current value")).not.toBeInTheDocument()
  },
}
