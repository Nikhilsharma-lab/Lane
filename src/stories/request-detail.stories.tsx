import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { RequestDetailSkeleton, RequestUnavailable } from "@/components/requests/detail-view"
import { addComment, getAttachmentDownloadUrl, markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import type { RequestPriority } from "@/lib/request-constants"
import {
  DetailFixture, ShellOnly, announcer, comments, deferred, desktopLight, expectPinnedViewport, filledButtons, inProgress, main, minimalRequest,
  panelShown, phoneDark, request, stateLine, statusCell, strip, waitingReview,
} from "./helpers/request-detail-fixture"

// Plan item 2.5: Request detail. Illustrative fixtures; every server action is mocked.
const meta = {
  title: "Requests/Detail",
  component: DetailFixture,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/requests/fixture-request" } } },
  beforeEach: () => {
    mocked(addComment).mockReset().mockImplementation(async () => ({ success: true as const, comment: { id: "fixture-new-comment", createdAt: new Date() } }))
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    mocked(undoMarkDone).mockReset().mockResolvedValue({ success: true, status: "in_progress" })
    mocked(setRequestPriority).mockReset().mockImplementation(async (_id, priority) => ({ success: true as const, priority: priority as RequestPriority }))
    mocked(getAttachmentDownloadUrl).mockReset().mockResolvedValue({ error: "Couldn’t prepare the download. Try again." })
    for (const method of ["push", "replace", "prefetch", "refresh"] as const) getRouter()[method].mockReset()
  },
} satisfies Meta<typeof DetailFixture>
export default meta
type Story = StoryObj<typeof meta>

const toasts = (canvasElement: HTMLElement) => within(canvasElement).getByRole("region", { name: /^Messages/ })
const regionIds = (canvasElement: HTMLElement) => [...main(canvasElement).querySelectorAll<HTMLElement>("[data-detail-main] > section[id]")].map(section => section.id)
const noHorizontalScroll = () => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)

/** Opens the panel's Priority menu (from 960px of content) or the state line's sheet, and chooses one. */
async function choosePriority(canvasElement: HTMLElement, label: string) {
  const page = within(document.body)
  if (panelShown(canvasElement)) {
    await userEvent.click(within(main(canvasElement).querySelector<HTMLElement>("[data-detail-panel]")!).getByRole("button", { name: /^Priority: .*Change priority$/ }))
    await userEvent.click(await page.findByRole("menuitemcheckbox", { name: label }))
    return
  }
  await userEvent.click(stateLine(canvasElement))
  const sheet = within(await page.findByRole("dialog", { name: "Properties" }))
  await userEvent.click(await sheet.findByRole("combobox", { name: "Priority" }))
  await userEvent.click(await page.findByRole("option", { name: label }))
  // The listbox animates out; until it has, it holds Esc and hides the sheet from assistive tech.
  await waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
}
/** The shown status: the panel's row from 960px of content, the state line below. */
async function expectStatus(canvasElement: HTMLElement, status: "open" | "in_progress" | "done") {
  const label = { open: "Open", in_progress: "In Progress", done: "Done" }[status]
  await expect(statusCell(canvasElement)).toHaveAttribute("data-status", status)
  await expect(stateLine(canvasElement)).toHaveTextContent(new RegExp(`^${label},`))
}

/** One strip, the regions in reading order, the panel's rows, and one filled button. */
export const Default: Story = {
  args: { attachments: undefined, review: { version: 0, reviews: [] } },
  play: async ({ canvasElement }) => {
    const bar = strip(canvasElement)
    await expect(main(canvasElement).querySelectorAll('[data-slot="page-strip"]')).toHaveLength(1)
    const crumbs = [...bar.querySelectorAll("nav li")].filter(item => item.getClientRects().length > 0).map(item => item.textContent)
    await expect(crumbs).toEqual(innerWidth <= 640 ? ["LAN-12"] : ["Lane Studio", "Website", "LAN-12"])
    await expect(Math.round(bar.getBoundingClientRect().height)).toBe(44)
    await expect(regionIds(canvasElement)).toEqual(["problem", "expected-impact", "files", "ask-for-review", "conversation"])
    const labels = [...main(canvasElement).querySelectorAll("[data-detail-panel] dt")].map(term => term.textContent)
    await expect(labels).toEqual(["Status", "Priority", "Assignee", "Project", "Type", "Submitted"])
    const page = within(main(canvasElement))
    await expect(page.queryByRole("region", { name: "People" })).not.toBeInTheDocument()
    await expect(page.queryByText(/Owner/)).not.toBeInTheDocument()
    // The title is the page's h1 at the composer's size; the description sits under it, always.
    const title = page.getByRole("heading", { level: 1 })
    await expect(title).toHaveTextContent(request.reframedProblem!)
    await expect(title.parentElement!.nextElementSibling).toHaveAttribute("id", "problem")
    await expect(page.getByText(request.description)).toBeVisible()
    await expect(filledButtons(canvasElement).map(button => button.textContent)).toEqual(["Pick up"])
    noHorizontalScroll()
  },
}

/** Alignment and outcome are reserved by the order of the code and render nothing in Phase 2. */
export const NoReservedSections: Story = {
  play: async ({ canvasElement }) => {
    const root = main(canvasElement)
    await expect(root.querySelector("#alignment, #outcome")).toBeNull()
    await expect(root.textContent).not.toMatch(/Alignment|Outcome/)
    await expect(root.querySelectorAll("[data-detail-panel] button:disabled")).toHaveLength(0)
  },
}

export const Minimal: Story = {
  args: { current: minimalRequest, comments: [], attachments: [] },
  play: async ({ canvasElement }) => {
    const root = main(canvasElement)
    await expect(root.querySelector("#expected-impact")).toBeNull()
    await expect(root.querySelector("#files")).toBeNull()
    await expect(within(root.querySelector<HTMLElement>("#conversation")!).getByText("No comments yet. Add a question or update below.")).toBeVisible()
    await expect(within(root).queryByRole("group", { name: /Original Request/ })).not.toBeInTheDocument()
    await expect(root.textContent).not.toContain("Original Request")
    if (panelShown(canvasElement)) await expect(within(root.querySelector<HTMLElement>("[data-detail-panel]")!).getByText("No Project")).toBeVisible()
  },
}

export const LongContent: Story = {
  args: {
    current: { ...request, projectName: "Checkout, delivery promises and post-purchase communication across every market, ".repeat(3).trim(), reframedProblem: "Customers returning to a shared workspace cannot identify which delivery date applies to their selected product when several delivery options have changed since their previous visit", creatorName: "Alexandria Long Workspace Member Name", description: "Long context remains readable without expanding the page horizontally. ".repeat(18), usefulLink: `https://example.com/research/${"delivery-context-".repeat(15)}` },
  },
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready
    await expect(Math.round(strip(canvasElement).getBoundingClientRect().height)).toBe(44)
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
    if (innerWidth > 640) {
      const project = within(strip(canvasElement)).getByRole("link", { name: /^Checkout, delivery promises/ })
      await expect(project.scrollWidth).toBeGreaterThan(project.clientWidth)
    }
  },
}

export const InProgress: Story = {
  args: { current: inProgress },
  play: async ({ canvasElement }) => {
    await expect(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" })).toBeVisible()
    await expect(statusCell(canvasElement)).toHaveAttribute("data-status", "in_progress")
    if (panelShown(canvasElement)) await expect(within(main(canvasElement).querySelector<HTMLElement>("[data-detail-panel]")!).getByText("Taylor Chen")).toBeVisible()
  },
}

export const Done: Story = {
  args: { current: { ...inProgress, status: "done" } },
  play: async ({ canvasElement }) => {
    await expect(within(strip(canvasElement)).queryByRole("button", { name: /Pick up|Mark Done/ })).not.toBeInTheDocument()
    await expect(filledButtons(canvasElement)).toHaveLength(0)
    // Nothing to move to: Status is text. Priority stays editable on a Done Request.
    await expect(statusCell(canvasElement).querySelector("button")).toBeNull()
    await expect(statusCell(canvasElement)).toHaveTextContent("Done")
    await expect(main(canvasElement).querySelector("[data-detail-panel] [data-detail-priority] button")).not.toBeNull()
  },
}

/** A guest reads every row, copies and comments, and never sees a move or a priority control. */
export const Guest: Story = {
  args: { guest: true },
  play: async ({ canvasElement }) => {
    const root = main(canvasElement)
    const canvas = within(root)
    await expect(canvas.queryByRole("button", { name: /^(Pick up|Mark Done)$/ })).not.toBeInTheDocument()
    await expect(root.querySelectorAll("[data-detail-panel] [data-detail-status] button, [data-detail-panel] [data-detail-priority] button")).toHaveLength(0)
    await expect(canvas.getByRole("textbox", { name: "Comment" })).toBeVisible()
    await expect(root.querySelector("#ask-for-review")).toBeNull()
    if (innerWidth > 640) {
      await expect(within(strip(canvasElement)).getByRole("button", { name: "Copy link" })).toBeVisible()
      await expect(within(strip(canvasElement)).getByRole("button", { name: "Copy code LAN-12" })).toBeVisible()
    } else await expect(within(strip(canvasElement)).getByRole("button", { name: "More actions" })).toBeVisible()
    await expect(filledButtons(canvasElement)).toHaveLength(0)
  },
}

/** A guest sees Ask for review once a review exists, read-only. */
export const GuestWithReview: Story = {
  args: { guest: true, review: waitingReview },
  play: async ({ canvasElement }) => {
    const review = within(within(main(canvasElement)).getByRole("region", { name: "Ask for review" }))
    await expect(review.getByText("Waiting for feedback")).toBeVisible()
    await expect(review.queryByRole("button")).not.toBeInTheDocument()
  },
}

async function expectUnavailable(canvasElement: HTMLElement) {
  const root = main(canvasElement)
  const h1s = within(root).getAllByRole("heading", { level: 1 })
  await expect(h1s.map(heading => heading.textContent)).toEqual(["Request unavailable"])
  await expect(strip(canvasElement)).toContainElement(h1s[0])
  await expect(within(root).getByText("This Request can’t be opened")).toBeVisible()
  await expect(within(root).getByText("It could not be found or is not available in this workspace.")).toBeVisible()
  await expect(within(strip(canvasElement)).getByRole("link", { name: "Back to Requests" })).toBeVisible()
  await expect(within(root).getAllByRole("link", { name: "Back to Requests" })).toHaveLength(2)
}
/** A malformed, missing or other workspace's id. */
export const NotFound: Story = { render: () => <ShellOnly><RequestUnavailable returnHref="/" /></ShellOnly>, play: ({ canvasElement }) => expectUnavailable(canvasElement) }
/** A guest opening a member's Request reads exactly as not found: no existence leak. */
export const Forbidden: Story = { render: () => <ShellOnly guest><RequestUnavailable returnHref="/" /></ShellOnly>, play: ({ canvasElement }) => expectUnavailable(canvasElement) }

/** A member downgraded mid-session: the move rolls back with the guard's words, never "Not found". */
export const MutationForbidden: Story = {
  args: { current: inProgress },
  play: async ({ canvasElement }) => {
    const refusal = deferred<{ error: string }>()
    mocked(markDone).mockImplementation(() => refusal.promise)
    await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" }))
    await expectStatus(canvasElement, "done")
    refusal.resolve({ error: "You can't change Requests in this workspace." })
    await waitFor(() => expect(toasts(canvasElement)).toHaveTextContent("You can't change Requests in this workspace."))
    await expectStatus(canvasElement, "in_progress")
    await expect(toasts(canvasElement)).not.toHaveTextContent("Not found")
  },
}

/** An expired session: the first answer is the guard's refusal, the token refreshes, the retry succeeds, nothing reverts. */
export const SessionExpiredRetry: Story = {
  args: { current: inProgress },
  play: async ({ canvasElement }) => {
    mocked(markDone).mockResolvedValueOnce({ error: "You can't change Requests in this workspace." }).mockResolvedValueOnce({ success: true })
    const seen: string[] = []
    const observer = new MutationObserver(() => { const status = statusCell(canvasElement).dataset.status!; if (seen.at(-1) !== status) seen.push(status) })
    observer.observe(statusCell(canvasElement), { attributes: true, attributeFilter: ["data-status"] })
    try {
      await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" }))
      await waitFor(() => expect(markDone).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(within(strip(canvasElement)).queryByRole("button", { name: /Completing/ })).not.toBeInTheDocument())
      await expect(seen).toEqual(["done"])
      await expect(within(toasts(canvasElement)).getAllByText("Marked Done")).toHaveLength(1)
    } finally { observer.disconnect() }
  },
}

/** Pick up shows In Progress and the viewer as Assignee in the same frame; a second press sends nothing. */
export const PickUpAcknowledged: Story = {
  play: async ({ canvasElement }) => {
    const answer = deferred<{ success: boolean }>()
    mocked(pickUpRequest).mockImplementation(() => answer.promise)
    const button = within(strip(canvasElement)).getByRole("button", { name: "Pick up" })
    button.click(); button.click()
    const picking = await within(strip(canvasElement)).findByRole("button", { name: "Picking up…" })
    await expect(picking).toBeDisabled()
    await expect(picking).toHaveAttribute("aria-busy", "true")
    await expect(pickUpRequest).toHaveBeenCalledOnce()
    await expectStatus(canvasElement, "in_progress")
    await expect(main(canvasElement).querySelector("[data-detail-panel] dl:nth-of-type(2)")).toHaveTextContent("Alex Morgan")
    await expect(announcer(canvasElement)).toHaveTextContent("Picked up. The Request is now In Progress.")
    answer.resolve({ success: true })
    await expect(await within(strip(canvasElement)).findByRole("button", { name: "Mark Done" })).toBeEnabled()
  },
}

/** Mark Done shows Done and a "Marked Done" toast with Undo before the answer; a refusal rolls back and returns the button. */
export const MarkDoneAcknowledged: Story = {
  args: { current: inProgress },
  play: async ({ canvasElement }) => {
    const answer = deferred<{ error: string }>()
    mocked(markDone).mockImplementation(() => answer.promise)
    const button = within(strip(canvasElement)).getByRole("button", { name: "Mark Done" })
    button.click(); button.click()
    const completing = await within(strip(canvasElement)).findByRole("button", { name: "Completing…" })
    await expect(completing).toBeDisabled()
    await expect(completing).toHaveAttribute("aria-busy", "true")
    await expect(markDone).toHaveBeenCalledOnce()
    await expectStatus(canvasElement, "done")
    await expect(within(toasts(canvasElement)).getByText("Marked Done")).toBeInTheDocument()
    await expect(within(toasts(canvasElement)).getByRole("button", { name: "Undo" })).toBeInTheDocument()
    answer.resolve({ error: "This Request changed before Lane could mark it Done." })
    await waitFor(() => expect(toasts(canvasElement)).toHaveTextContent("Could not update this Request"))
    await expect(toasts(canvasElement)).toHaveTextContent("This Request changed before Lane could mark it Done.")
    await expectStatus(canvasElement, "in_progress")
    await waitFor(() => expect(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" })).toBeEnabled())
    await expect(markDone).toHaveBeenCalledOnce()
  },
}

/** Success never reverts: a stale server render keeps Done, the fresh one agrees. */
export const MarkDoneNoRevert: Story = {
  args: { current: inProgress, fresh: { request: { ...inProgress, status: "done" } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const seen: string[] = [statusCell(canvasElement).dataset.status!]
    const observer = new MutationObserver(() => { const status = statusCell(canvasElement).dataset.status!; if (seen.at(-1) !== status) seen.push(status) })
    observer.observe(main(canvasElement), { attributes: true, subtree: true, attributeFilter: ["data-status"] })
    try {
      await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" }))
      await waitFor(() => expect(within(strip(canvasElement)).queryByRole("button", { name: /Completing|Mark Done/ })).not.toBeInTheDocument())
      await userEvent.click(canvas.getByRole("button", { name: "Deliver stale server render" }))
      await expectStatus(canvasElement, "done")
      await userEvent.click(canvas.getByRole("button", { name: "Deliver fresh server render" }))
      await expectStatus(canvasElement, "done")
      await expect(seen).toEqual(["in_progress", "done"])
    } finally { observer.disconnect() }
  },
}

/** Undo from the toast is sent after Mark Done succeeded and brings back Mark Done. */
export const MarkDoneUndo: Story = {
  args: { current: inProgress },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" }))
    await userEvent.click(await within(toasts(canvasElement)).findByRole("button", { name: "Undo" }))
    await waitFor(() => expect(undoMarkDone).toHaveBeenCalledOnce())
    await expect(mocked(markDone).mock.invocationCallOrder[0]).toBeLessThan(mocked(undoMarkDone).mock.invocationCallOrder[0])
    await waitFor(() => expect(toasts(canvasElement)).toHaveTextContent("Back In Progress"))
    await expectStatus(canvasElement, "in_progress")
    await expect(await within(strip(canvasElement)).findByRole("button", { name: "Mark Done" })).toBeVisible()
  },
}

/** Undo waits for the Done it reverses; when that Done fails, Undo is never sent. */
export const UndoWaitsForPendingDone: Story = {
  args: { current: inProgress },
  play: async ({ canvasElement }) => {
    const answer = deferred<{ error: string }>()
    mocked(markDone).mockImplementation(() => answer.promise)
    await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" }))
    await userEvent.click(await within(toasts(canvasElement)).findByRole("button", { name: "Undo" }))
    await expect(undoMarkDone).not.toHaveBeenCalled()
    answer.resolve({ error: "This Request changed before Lane could mark it Done." })
    await waitFor(() => expect(toasts(canvasElement)).toHaveTextContent("Could not update this Request"))
    await expectStatus(canvasElement, "in_progress")
    await expect(undoMarkDone).not.toHaveBeenCalled()
  },
}

/** Priority shows in the panel and the state line in the same frame; a refusal rolls back with a message. */
export const PriorityAcknowledged: Story = {
  play: async ({ canvasElement }) => {
    const answer = deferred<{ error: string }>()
    mocked(setRequestPriority).mockImplementation(() => answer.promise)
    await choosePriority(canvasElement, "High")
    await waitFor(() => expect(main(canvasElement).querySelector("[data-detail-priority]")).toHaveAttribute("data-priority", "high"))
    await expect(stateLine(canvasElement)).toHaveTextContent("Open, High priority")
    await expect(announcer(canvasElement)).toHaveTextContent("Priority set to high.")
    answer.resolve({ error: "You can't change Requests in this workspace." })
    await waitFor(() => expect(main(canvasElement).querySelector("[data-detail-priority]")).toHaveAttribute("data-priority", "none"))
    await expect(stateLine(canvasElement)).toHaveTextContent("Open, No priority")
    await waitFor(() => expect(toasts(canvasElement)).toHaveTextContent("You can't change Requests in this workspace."))
  },
}

/** A confirmed priority survives a stale render and clears once the fresh render shows it. */
export const PriorityNoRevert: Story = {
  args: { fresh: { request: { ...request, priority: "high" } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choosePriority(canvasElement, "High")
    await waitFor(() => expect(setRequestPriority).toHaveBeenCalledOnce())
    // On a phone the choice was made in the Properties sheet; close it first.
    if (!panelShown(canvasElement)) {
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Properties", hidden: true })).not.toBeInTheDocument())
    }
    await userEvent.click(canvas.getByRole("button", { name: "Deliver stale server render" }))
    await expect(main(canvasElement).querySelector("[data-detail-priority]")).toHaveAttribute("data-priority", "high")
    await userEvent.click(canvas.getByRole("button", { name: "Deliver fresh server render" }))
    await expect(main(canvasElement).querySelector("[data-detail-priority]")).toHaveAttribute("data-priority", "high")
    await expect(stateLine(canvasElement)).toHaveTextContent("Open, High priority")
  },
}

const comment = (canvasElement: HTMLElement) => within(main(canvasElement)).getByRole("textbox", { name: "Comment" })
const commentRows = (canvasElement: HTMLElement) => [...main(canvasElement).querySelectorAll<HTMLElement>("#conversation li")]

/** The comment shows with "Sending…" before the answer; the box clears; the server copy replaces it with no duplicate. */
export const CommentAppends: Story = {
  args: { fresh: { comments: [...comments, { id: "fixture-new-comment", body: "Can we ship this before the holiday freeze?", createdAt: new Date("2026-10-13T09:00:00Z"), authorName: "Alex Morgan" }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const answer = deferred<Awaited<ReturnType<typeof addComment>>>()
    mocked(addComment).mockImplementation(() => answer.promise)
    await userEvent.type(comment(canvasElement), "Can we ship this before the holiday freeze?")
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")
    await waitFor(() => expect(commentRows(canvasElement)).toHaveLength(2))
    await expect(commentRows(canvasElement)[1]).toHaveTextContent("Sending…")
    await expect(commentRows(canvasElement)[1]).toHaveTextContent("Can we ship this before the holiday freeze?")
    await expect(comment(canvasElement)).toHaveValue("")
    await expect(comment(canvasElement)).not.toHaveAttribute("readonly")
    await expect(within(main(canvasElement)).getByRole("button", { name: "Posting…" })).toBeDisabled()
    answer.resolve({ success: true, comment: { id: "fixture-new-comment", createdAt: new Date("2026-10-13T09:00:00Z") } })
    await waitFor(() => expect(commentRows(canvasElement)[1]).not.toHaveTextContent("Sending…"))
    await userEvent.click(canvas.getByRole("button", { name: "Deliver fresh server render" }))
    await waitFor(() => expect(commentRows(canvasElement)).toHaveLength(2))
    await expect(commentRows(canvasElement).filter(row => row.textContent?.includes("holiday freeze"))).toHaveLength(1)
    await expect(canvas.getByText("Comment posted.")).toHaveAttribute("role", "status")
  },
}

/** A failed post removes the comment and puts the text back, with a way to try again. */
export const CommentRollback: Story = {
  play: async ({ canvasElement }) => {
    const answer = deferred<Awaited<ReturnType<typeof addComment>>>()
    mocked(addComment).mockImplementationOnce(() => answer.promise)
    await userEvent.type(comment(canvasElement), "A question to preserve after a failed save.")
    await userEvent.click(within(main(canvasElement)).getByRole("button", { name: "Post comment" }))
    await waitFor(() => expect(commentRows(canvasElement)).toHaveLength(2))
    answer.reject(new Error("Fixture connection interrupted"))
    await waitFor(() => expect(commentRows(canvasElement)).toHaveLength(1))
    await expect(comment(canvasElement)).toHaveValue("A question to preserve after a failed save.")
    await expect(within(main(canvasElement)).getByRole("alert")).toHaveTextContent("Your draft is still here.")
    await userEvent.click(within(main(canvasElement)).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(comment(canvasElement)).toHaveValue(""))
    await expect(commentRows(canvasElement)).toHaveLength(2)
  },
}

/** A posted comment stays through a stale render; the fresh render holds exactly one copy. */
export const CommentNoRevert: Story = {
  args: { fresh: { comments: [...comments, { id: "fixture-new-comment", body: "Posted once.", createdAt: new Date("2026-10-13T09:00:00Z"), authorName: "Alex Morgan" }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(comment(canvasElement), "Posted once.")
    await userEvent.click(within(main(canvasElement)).getByRole("button", { name: "Post comment" }))
    await waitFor(() => expect(canvas.getByText("Comment posted.")).toBeInTheDocument())
    await userEvent.click(canvas.getByRole("button", { name: "Deliver stale server render" }))
    await expect(commentRows(canvasElement).filter(row => row.textContent?.includes("Posted once."))).toHaveLength(1)
    await userEvent.click(canvas.getByRole("button", { name: "Deliver fresh server render" }))
    await waitFor(() => expect(commentRows(canvasElement).filter(row => row.textContent?.includes("Posted once."))).toHaveLength(1))
    await expect(commentRows(canvasElement)).toHaveLength(2)
  },
}

function stubClipboard(writeText: ReturnType<typeof fn>) {
  const clipboard = navigator.clipboard
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  return () => Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard })
}

/** Copy code and Copy link confirm with a check and in the polite region. */
export const CopyLinkAndCode: Story = {
  globals: desktopLight,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const writeText = fn().mockResolvedValue(undefined)
    const restore = stubClipboard(writeText)
    try {
      const bar = within(strip(canvasElement))
      const code = bar.getByRole("button", { name: "Copy code LAN-12" })
      await userEvent.click(code)
      await expect(writeText).toHaveBeenCalledWith("LAN-12")
      await waitFor(() => expect(code).toHaveAttribute("data-copy-state", "copied"))
      await expect(announcer(canvasElement)).toHaveTextContent("LAN-12 copied.")
      await userEvent.click(bar.getByRole("button", { name: "Copy link" }))
      await expect(writeText).toHaveBeenLastCalledWith(new URL("/requests/fixture-request", window.location.origin).href)
      await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent("Link copied."))
    } finally { restore() }
  },
}

export const CopyFails: Story = {
  globals: desktopLight,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const restore = stubClipboard(fn().mockRejectedValue(new Error("Denied")))
    try {
      await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "Copy link" }))
      await waitFor(() => expect(toasts(canvasElement)).toHaveTextContent("Could not copy"))
      await expect(toasts(canvasElement)).toHaveTextContent("Select the text and copy it instead.")
      await expect(within(strip(canvasElement)).getByRole("button", { name: "Retry copying" })).toBeVisible()
    } finally { restore() }
  },
}

/** At 390 the state line opens Properties; priority changes there and the line follows in the same frame. */
export const PhoneProperties: Story = {
  globals: phoneDark,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const line = stateLine(canvasElement)
    await expect(line).toHaveTextContent("Open, No priority")
    await expect(panelShown(canvasElement)).toBe(false)
    await choosePriority(canvasElement, "High")
    await waitFor(() => expect(line).toHaveTextContent("Open, High priority"))
    await expect(await within(document.body).findByRole("dialog", { name: "Properties" })).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Properties", hidden: true })).not.toBeInTheDocument())
    await waitFor(() => expect(line).toHaveFocus())
  },
}

/** At 390 the strip keeps expand, back, the code, the action and More actions, in 44px with no trailing gap. */
export const PhoneStrip: Story = {
  globals: phoneDark,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const bar = strip(canvasElement)
    const painted = [...bar.querySelectorAll<HTMLElement>("a, button, [aria-current] span")].filter(element => element.getClientRects().length > 0)
    const names = painted.map(element => element.getAttribute("aria-label") ?? element.textContent?.trim())
    await expect(names).toEqual(["Expand sidebar", "Back to Requests", "LAN-12", "Pick up", "More actions"])
    await expect(Math.round(bar.getBoundingClientRect().height)).toBe(44)
    const end = bar.lastElementChild!
    const boxes = [...end.querySelectorAll("*")].map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0)
    await expect(Math.abs(end.getBoundingClientRect().right - Math.max(...boxes.map(box => box.right)))).toBeLessThanOrEqual(0.5)
    noHorizontalScroll()
  },
}

/** Ask for review is its own region with a secondary header button. */
export const AskForReview: Story = {
  args: { current: minimalRequest, comments: [], attachments: [] },
  play: async ({ canvasElement }) => {
    const region = within(main(canvasElement)).getByRole("region", { name: "Ask for review" })
    await expect(region).toHaveAttribute("id", "ask-for-review")
    const button = within(region).getByRole("button", { name: "Ask for review" })
    await expect(filledButtons(canvasElement)).not.toContain(button)
    await expect(within(main(canvasElement)).getByRole("textbox", { name: "Comment" })).toBeInTheDocument()
    noHorizontalScroll()
  },
}

/** While the viewer's review form is open, its submit is the page's one filled button: the strip action steps aside. */
export const StripHidesWhileReviewFormOpen: Story = {
  args: { current: minimalRequest, comments: [], attachments: [] },
  play: async ({ canvasElement }) => {
    const region = within(within(main(canvasElement)).getByRole("region", { name: "Ask for review" }))
    await userEvent.click(region.getByRole("button", { name: "Ask for review" }))
    await waitFor(() => expect(within(strip(canvasElement)).queryByRole("button", { name: "Pick up" })).not.toBeInTheDocument())
    await expect(filledButtons(canvasElement).map(button => button.textContent)).toEqual(["Ask for review"])
    await userEvent.click(region.getByRole("button", { name: "Cancel" }))
    await expect(await within(strip(canvasElement)).findByRole("button", { name: "Pick up" })).toBeVisible()
  },
}

export const ExpectedMetricImpact: Story = {
  args: { comments: [], attachments: [], current: { ...minimalRequest, expectedImpact: { kind: "metric", metric: "Customers finding a saved draft", baseline: null, target: 90, unit: "%", source: "Saved-draft usability check", reviewAfterDays: 14 } } },
  play: async ({ canvasElement }) => {
    const region = await within(canvasElement).findByRole("region", { name: "Expected impact" })
    await expect(region).toHaveAttribute("id", "expected-impact")
    const impact = within(region)
    await expect(impact.getByText("Customers finding a saved draft")).toBeVisible()
    await expect(impact.getByText("Not measured yet")).toBeVisible()
    await expect(impact.getByText("90 %")).toBeVisible()
    await expect(impact.getByText("Saved-draft usability check")).toBeVisible()
    await expect(impact.getByText("14 days")).toBeVisible()
    await expect(impact.queryByRole("textbox")).not.toBeInTheDocument()
  },
}

export const ExpectedVerifiedImpact: Story = {
  args: { comments: [], attachments: [], current: { ...minimalRequest, expectedImpact: { kind: "verification", result: "Customers can reopen an unfinished draft after signing in again.", source: "Verify on the supported browsers with a saved draft.", reviewAfterDays: 1 } } },
  play: async ({ canvasElement }) => {
    const impact = within(await within(canvasElement).findByRole("region", { name: "Expected impact" }))
    await expect(impact.getByText("Customers can reopen an unfinished draft after signing in again.")).toBeVisible()
    await expect(impact.getByText("Verify on the supported browsers with a saved draft.")).toBeVisible()
    await expect(impact.getByText("1 day")).toBeVisible()
    await expect(impact.queryByText("Current value")).not.toBeInTheDocument()
  },
}

export const ExpectedImpactGuardrail: Story = {
  args: { comments: [], attachments: [], current: { ...minimalRequest, expectedImpact: { kind: "metric", metric: "Checkout completion", baseline: 62, target: 70, unit: "%", guardrail: { metric: "Support contacts about delivery", operator: "at_most", limit: 120, unit: "per week" }, source: "", reviewAfterDays: 30 } } },
  play: async ({ canvasElement }) => {
    const impact = within(await within(canvasElement).findByRole("region", { name: "Expected impact" }))
    await expect(impact.getByText("Guardrail metric")).toBeVisible()
    await expect(impact.queryByText("Data source")).not.toBeInTheDocument()
    await expect(impact.getByText("30 days")).toBeVisible()
  },
}

/** The skeleton: one strip, one status, no content anchors. Swap checks live in app-frame.stories.tsx. */
export const Loading: Story = {
  render: () => <ShellOnly><RequestDetailSkeleton /></ShellOnly>,
  play: async ({ canvasElement }) => {
    const root = main(canvasElement)
    await expect(within(root).getAllByRole("status")).toHaveLength(1)
    await expect(root.querySelector("#problem, #request-title, [data-request-id]")).toBeNull()
    await expect(Math.round(strip(canvasElement).getBoundingClientRect().height)).toBe(44)
  },
}

