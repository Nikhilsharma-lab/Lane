import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { RequestUnavailable } from "@/components/requests/detail-view"
import { RequestDetailSkeleton } from "@/components/requests/detail-skeleton"
import { addComment, getAttachmentDownloadUrl, markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import type { RequestPriority } from "@/lib/request-constants"
import {
  DetailFixture, ShellOnly, announcer, comments, deferred, desktopLight, expectPinnedViewport, filledButtons, inProgress, main, minimalRequest,
  panelShown, pendingLayers, phoneDark, request, stateLine, statusCell, strip, waitingOnViewer, waitingReview,
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
  // Under reduced motion the toast stack fades with motion values, which run in
  // JS: the preview's settle step only sees CSS and WAAPI animations, so axe could
  // read a toast mid-fade. Wait for the toasts to finish, then let axe report. A
  // throw here would also skip Storybook's cleanup of its paused-animation style,
  // which then leaks into every later story in the file.
  afterEach: async ({ canvasElement }) => {
    const region = within(canvasElement).queryByRole("region", { name: /^Messages/ })
    if (!region) return
    const fading = () => [...region.querySelectorAll<HTMLElement>("[style*='opacity']")].filter(element => { const value = Number(element.style.opacity); return value > 0 && value < 1 })
    await waitFor(() => expect(fading()).toHaveLength(0)).catch(() => undefined)
  },
} satisfies Meta<typeof DetailFixture>
export default meta
type Story = StoryObj<typeof meta>

const toasts = (canvasElement: HTMLElement) => within(canvasElement).getByRole("region", { name: /^Messages/ })
const regionIds = (canvasElement: HTMLElement) => [...main(canvasElement).querySelectorAll<HTMLElement>("[data-detail-main] > section[id]")].map(section => section.id)
const noHorizontalScroll = () => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)

/** Resolve the approved header token in the browser, then check its exact rendered height. */
async function expectStripHeight(strip: Element) {
  const probe = document.createElement("span")
  probe.style.cssText = "position: absolute; visibility: hidden; height: var(--workspace-header-height); width: 0; padding: 0; border: 0"
  strip.append(probe)
  const expected = probe.getBoundingClientRect().height
  probe.remove()
  await expect(expected).toBeGreaterThan(0)
  await expect(Math.round(strip.getBoundingClientRect().height)).toBe(Math.round(expected))
}

/** Opens the panel's Priority menu (from 960px of content) or the state line's sheet, and chooses one. */
async function choosePriority(canvasElement: HTMLElement, label: string) {
  const page = within(document.body)
  if (panelShown(canvasElement)) {
    await userEvent.click(within(main(canvasElement).querySelector<HTMLElement>("[data-detail-panel]")!).getByRole("combobox", { name: /^Priority/ }))
    await userEvent.click(await page.findByRole("option", { name: label }))
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
    return
  }
  await userEvent.click(stateLine(canvasElement))
  const sheet = within(await page.findByRole("dialog", { name: "Properties" }))
  await userEvent.click(await sheet.findByRole("combobox", { name: /^Priority/ }))
  await userEvent.click(await page.findByRole("option", { name: label }))
  // The listbox animates out; until it has, it holds Esc and hides the sheet from assistive tech.
  await waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
}
/** The shown status: the panel's row from 960px of content, the state line below. */
async function expectStatus(canvasElement: HTMLElement, status: "open" | "in_progress" | "done") {
  const label = { open: "Open", in_progress: "In Progress", done: "Done" }[status]
  await expect(statusCell(canvasElement)).toHaveAttribute("data-status", status)
  // The new label is there in the same frame; the Arc Button lets the old one fade out first.
  await waitFor(() => expect(stateLine(canvasElement)).toHaveAttribute("aria-label", expect.stringMatching(new RegExp(`^Properties: ${label},`))))
}

/** One-line values keep every panel row at 32px, the editable ones and the Assignee's avatar included. */
async function expectOneLineRows(canvasElement: HTMLElement) {
  if (!panelShown(canvasElement)) return
  const rows = [...main(canvasElement).querySelectorAll<HTMLElement>("[data-detail-panel] dl > div")]
  await expect(rows.map(row => Math.round(row.getBoundingClientRect().height))).toEqual(rows.map(() => 32))
}

/** One strip, the regions in reading order, the panel's rows, and one filled button. */
export const Default: Story = {
  args: { attachments: undefined, review: { version: 0, reviews: [] } },
  play: async ({ canvasElement }) => {
    const bar = strip(canvasElement)
    await expect(main(canvasElement).querySelectorAll('[data-slot="page-strip"]')).toHaveLength(1)
    const crumbs = [...bar.querySelectorAll("nav li")].filter(item => item.getClientRects().length > 0).map(item => item.textContent)
    await expect(crumbs).toEqual(innerWidth <= 640 ? ["LAN-12"] : ["Lane Studio", "Website", "LAN-12"])
    await expectStripHeight(bar)
    await expect(regionIds(canvasElement)).toEqual(["problem", "expected-impact", "files", "conversation"])
    const labels = [...main(canvasElement).querySelectorAll("[data-detail-panel] dt")].map(term => term.textContent)
    await expect(labels).toEqual(["Status", "Priority", "Assignee", "Project", "Labels", "Submitted"])
    await expectOneLineRows(canvasElement)
    const page = within(main(canvasElement))
    await expect(page.queryByRole("region", { name: "People" })).not.toBeInTheDocument()
    await expect(page.queryByText(/Owner/)).not.toBeInTheDocument()
    // The title is the page's h1 at the composer's size; the description sits under it, always.
    const title = page.getByRole("heading", { level: 1 })
    await expect(title).toHaveTextContent(request.title)
    const problemSection = within(main(canvasElement).querySelector<HTMLElement>("#problem")!)
    await expect(problemSection.getByText(request.reframedProblem!, { exact: true })).toBeVisible()
    await userEvent.click(problemSection.getByText("Original Request", { exact: true }))
    await expect(problemSection.getByText(request.description, { exact: true })).toBeVisible()
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
    await expect(within(root.querySelector<HTMLElement>("#conversation")!).getByRole("textbox", { name: "Comment" })).toBeVisible()
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
    await expectStripHeight(strip(canvasElement))
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
    if (innerWidth > 640) {
      const project = within(strip(canvasElement)).getByRole("link", { name: /^Checkout, delivery promises/ })
      await expect(project.scrollWidth).toBeGreaterThan(project.clientWidth)
    }
    // The panel wraps its values: Submitted keeps its time in view and the Project's full name can be read.
    if (panelShown(canvasElement)) {
      const values = [...main(canvasElement).querySelectorAll<HTMLElement>("[data-detail-panel] dd")]
      const submitted = values.find(value => value.querySelector("time"))!
      await expect(submitted.querySelector("time")!.getBoundingClientRect().right).toBeLessThanOrEqual(submitted.getBoundingClientRect().right + 0.5)
      const project = values.find(value => value.textContent?.startsWith("Checkout, delivery promises"))!
      for (const text of project.querySelectorAll<HTMLElement>("span")) await expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth)
      await expect(project.getBoundingClientRect().right).toBeLessThanOrEqual(main(canvasElement).querySelector("[data-detail-panel]")!.getBoundingClientRect().right + 0.5)
    }
  },
}

export const InProgress: Story = {
  args: { current: inProgress },
  play: async ({ canvasElement }) => {
    await expect(within(strip(canvasElement)).getByRole("button", { name: "Mark Done" })).toBeVisible()
    await expect(statusCell(canvasElement)).toHaveAttribute("data-status", "in_progress")
    if (panelShown(canvasElement)) await expect(within(main(canvasElement).querySelector<HTMLElement>("[data-detail-panel]")!).getByText("Taylor Chen")).toBeVisible()
    await expectOneLineRows(canvasElement)
  },
}

export const Done: Story = {
  args: { current: { ...inProgress, status: "done" } },
  play: async ({ canvasElement }) => {
    await expect(within(strip(canvasElement)).queryByRole("button", { name: /Pick up|Mark Done/ })).not.toBeInTheDocument()
    await expect(filledButtons(canvasElement)).toHaveLength(0)
    // Both lifecycle and content edits are unavailable after Done.
    await expect(statusCell(canvasElement).querySelector("button")).toBeNull()
    await expect(statusCell(canvasElement)).toHaveTextContent("Done")
    await expect(main(canvasElement).querySelector("[data-detail-panel] [data-detail-priority] button")).toBeNull()
  },
}

/** Done remains noninteractive, but must not switch to a differently shaped badge. */
export const PropertyControlConsistency: Story = {
  args: { current: { ...inProgress, status: "done" } },
  play: async ({ canvasElement }) => {
    const group = canvasElement.querySelector<HTMLElement>('[aria-label="Request properties"]')!;
    // The compact row exists at all widths; reveal only this fixture to measure it on desktop.
    group.style.display = "flex";
    const controls = Array.from(group.children) as HTMLElement[];
    const status = controls[0];
    const priority = controls[1];
    await expect(within(group).queryByRole("combobox", { name: /^Priority:/ })).not.toBeInTheDocument();
    const properties = within(group).getByRole("button", { name: /^Properties:/ });
    await expect(status.tagName).toBe("SPAN");
    await expect(status.querySelector("button")).toBeNull();
    for (const control of [status, priority]) {
      for (const property of ["borderRadius", "backgroundColor", "boxShadow", "paddingInlineStart", "paddingInlineEnd", "fontSize"] as const) {
        await expect(getComputedStyle(control)[property], property).toBe(getComputedStyle(properties)[property]);
      }
      await expect(control.getBoundingClientRect().height).toBe(properties.getBoundingClientRect().height);
    }
    group.style.removeProperty("display");
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

/** Guests who can read a Request can also open its saved design link. */
export const GuestWithDesignLink: Story = {
  args: { current: inProgress, guest: true, review: waitingReview },
  play: async ({ canvasElement }) => {
    const review = within(within(main(canvasElement)).getByRole("region", { name: "Design" }))
    await expect(review.getByRole("link", { name: /Open design/ })).toHaveAttribute("href", waitingReview.reviews[0].designUrl)
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

/** A lost response on Pick up: detail's own copy says what to check, the move rolls back, and a retry succeeds. */
export const LifecycleRetry: Story = {
  play: async ({ canvasElement }) => {
    mocked(pickUpRequest).mockRejectedValueOnce(new Error("Fixture connection interrupted"))
    await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "Pick up" }))
    await waitFor(() => expect(toasts(canvasElement)).toHaveTextContent("Couldn’t confirm pickup. Refreshing now. Try again if this Request is still Open."))
    await expect(toasts(canvasElement)).toHaveTextContent("Could not update this Request")
    await expectStatus(canvasElement, "open")
    await expect(getRouter().refresh).toHaveBeenCalledOnce()
    const retry = await within(strip(canvasElement)).findByRole("button", { name: "Pick up" })
    await waitFor(() => expect(retry).toBeEnabled())
    await userEvent.click(retry)
    await expect(await within(strip(canvasElement)).findByRole("button", { name: "Mark Done" })).toBeEnabled()
    await expect(pickUpRequest).toHaveBeenCalledTimes(2)
    await expectStatus(canvasElement, "in_progress")
    await expect(getRouter().refresh).toHaveBeenCalledOnce()
  },
}

/** Mark Done from the panel's Status menu leaves no move there; focus goes to the title, never the page body. */
export const StatusMenuMarkDoneKeepsFocus: Story = {
  globals: desktopLight,
  args: { current: inProgress },
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    within(main(canvasElement).querySelector<HTMLElement>("[data-detail-panel]")!).getByRole("button", { name: /^Status: In Progress/ }).focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(within(document.body).getByRole("menuitem", { name: "Mark Done" })).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    await expectStatus(canvasElement, "done")
    await expect(statusCell(canvasElement).querySelector("button")).toBeNull()
    await waitFor(() => expect(within(main(canvasElement)).getByRole("heading", { level: 1 })).toHaveFocus())
    await expect(document.activeElement).not.toBe(document.body)
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
    await expect(stateLine(canvasElement)).toHaveAttribute("aria-label", "Properties: Open, High priority")
    await expect(announcer(canvasElement)).toHaveTextContent("Priority set to high.")
    answer.resolve({ error: "You can't change Requests in this workspace." })
    await waitFor(() => expect(main(canvasElement).querySelector("[data-detail-priority]")).toHaveAttribute("data-priority", "none"))
    await expect(stateLine(canvasElement)).toHaveAttribute("aria-label", "Properties: Open, No priority")
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
    await expect(pendingLayers(canvasElement)).toBe(request.id)
    await userEvent.click(canvas.getByRole("button", { name: "Deliver fresh server render" }))
    await expect(main(canvasElement).querySelector("[data-detail-priority]")).toHaveAttribute("data-priority", "high")
    await expect(stateLine(canvasElement)).toHaveAttribute("aria-label", "Properties: Open, High priority")
    // The fresh render shows High, so the overlay lets go of its layer.
    await waitFor(() => expect(pendingLayers(canvasElement)).toBe(""))
  },
}

/** Back to No priority: the confirmed "none" holds through the strip's re-render, a stale render, and clears on the fresh one. */
export const PriorityClearNoRevert: Story = {
  args: { current: { ...request, priority: "high" }, fresh: { request: { ...request, priority: "none" } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shown = () => main(canvasElement).querySelector<HTMLElement>("[data-detail-priority]")!.dataset.priority!
    const seen: string[] = [shown()]
    const observer = new MutationObserver(() => { if (seen.at(-1) !== shown()) seen.push(shown()) })
    observer.observe(main(canvasElement), { attributes: true, subtree: true, attributeFilter: ["data-priority"] })
    try {
      await choosePriority(canvasElement, "No priority")
      await waitFor(() => expect(setRequestPriority).toHaveBeenCalledWith(request.id, "none", expect.anything()))
      // Let the confirmed answer and the renders it causes settle before reading.
      await mocked(setRequestPriority).mock.results[0].value
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await expect(shown()).toBe("none")
      await expect(pendingLayers(canvasElement)).toBe(request.id)
      if (!panelShown(canvasElement)) {
        await userEvent.keyboard("{Escape}")
        await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Properties", hidden: true })).not.toBeInTheDocument())
      }
      await userEvent.click(canvas.getByRole("button", { name: "Deliver stale server render" }))
      await expect(shown()).toBe("none")
      await userEvent.click(canvas.getByRole("button", { name: "Deliver fresh server render" }))
      await waitFor(() => expect(pendingLayers(canvasElement)).toBe(""))
      await expect(stateLine(canvasElement)).toHaveAttribute("aria-label", "Properties: Open, No priority")
      await expect(seen).toEqual(["high", "none"])
    } finally { observer.disconnect() }
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
    await expect(getComputedStyle(canvas.getByRole("button", { name: "Post comment" }).querySelector("svg")!).width).toBe("14px")
    await userEvent.type(comment(canvasElement), "Can we ship this before the holiday freeze?")
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")
    await waitFor(() => expect(commentRows(canvasElement)).toHaveLength(2))
    await expect(commentRows(canvasElement)[1]).toHaveTextContent("Sending…")
    await expect(commentRows(canvasElement)[1]).toHaveTextContent("Can we ship this before the holiday freeze?")
    await expect(comment(canvasElement)).toHaveValue("")
    await expect(comment(canvasElement)).not.toHaveAttribute("readonly")
    await expect(within(main(canvasElement)).getByRole("button", { name: "Posting…" })).toBeDisabled()
    await expect(getComputedStyle(canvas.getByRole("button", { name: "Posting…" }).querySelector("svg")!).width).toBe("14px")
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
    await expect(line).toHaveAttribute("aria-label", "Properties: Open, No priority")
    await expect(panelShown(canvasElement)).toBe(false)
    await choosePriority(canvasElement, "High")
    await waitFor(() => expect(line).toHaveAttribute("aria-label", "Properties: Open, High priority"))
    await expect(await within(document.body).findByRole("dialog", { name: "Properties" })).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Properties", hidden: true })).not.toBeInTheDocument())
    await waitFor(() => expect(line).toHaveFocus())
  },
}

/** At 390 the strip keeps expand, back, the code, the action and More actions, at the header token height with no trailing gap. */
export const PhoneStrip: Story = {
  globals: phoneDark,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const bar = strip(canvasElement)
    const painted = [...bar.querySelectorAll<HTMLElement>("a, button, [aria-current] span")].filter(element => element.getClientRects().length > 0)
    const names = painted.map(element => element.getAttribute("aria-label") ?? element.textContent?.trim())
    await expect(names).toEqual(["Expand sidebar", "Back to Requests", "LAN-12", "Pick up", "More actions"])
    await expectStripHeight(bar)
    const end = bar.lastElementChild!
    const boxes = [...end.querySelectorAll("*")].map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0)
    await expect(Math.abs(end.getBoundingClientRect().right - Math.max(...boxes.map(box => box.right)))).toBeLessThanOrEqual(0.5)
    noHorizontalScroll()
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
    await expectStripHeight(strip(canvasElement))
  },
}

/** Lane tracks the Request; the Figma link is the only design-review control. */
export const FigmaOnlyReview: Story = {
  args: { current: { ...inProgress, usefulLink: "https://www.figma.com/design/example?node-id=1-2" }, review: waitingOnViewer },
  play: async ({ canvasElement }) => {
    const canvas = within(main(canvasElement))
    await expect(canvas.queryByRole("region", { name: "Ask for review" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Save decision" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: /Open in Figma/ })).toHaveAttribute("href", "https://www.figma.com/design/example?node-id=1-2")
    await expect(canvas.getByRole("textbox", { name: "Comment" })).toBeVisible()
    noHorizontalScroll()
  },
}
