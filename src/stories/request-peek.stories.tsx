import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { listProjects } from "@/app/(app)/intake/project-actions"
import { addComment, markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import { loadReviewerPeople, readReviews } from "@/app/(app)/requests/[id]/reviewer-actions"
import { readRequestRelease } from "@/app/(app)/requests/[id]/release-actions"
import { readRequestOutcome } from "@/app/(app)/requests/[id]/outcome-actions"
import { clearIntakeDraft, intakeDraftScope } from "@/lib/intake-draft"
import type { OverviewRequest } from "@/lib/request-overview"
import type { RequestPriority } from "@/lib/request-constants"
import { PendingMutationsProvider } from "@/components/requests/pending-mutations-provider"
import { LinearRequestsFixture, revalidateLinearPreview } from "./helpers/linear-requests-fixture"
import { requestRow } from "./helpers/request-grid"

// Plan item 2.12: the Request preview beside the list. Illustrative fixture content only; never
// inserted into a Lane workspace. Every server action is mocked and the detail GET route is stubbed.
const statusOf = (index: number) => index < 3 ? "open" as const : index < 5 ? "in_progress" as const : "done" as const
const requests: OverviewRequest[] = Array.from({ length: 6 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  requestNumber: index + 1,
  title: `Preview fixture Request ${index + 1}`,
  reframedProblem: null,
  status: statusOf(index),
  canEdit: statusOf(index) === "open",
  createdAt: new Date(Date.UTC(2026, 9, 1, 9, 0, 0) - index * 60_000).toISOString(),
  creatorName: "Alex Morgan",
  assigneeName: statusOf(index) === "open" ? null : "Sam Lee",
  assignedTo: statusOf(index) === "open" ? null : "person-sam",
  projectId: null,
  projectName: null,
  priority: "none",
}))
const context = { orgId: "org_storybook_preview" }
const viewer = { id: "linear-preview-person", name: "Jordan Reed", isAdmin: false }
const idOf = (index: number) => requests[index].id
const PREVIEW_QUERY = "(min-width: 768px) and (pointer: fine)"

/** The detail the GET route would answer for a fixture row: the same fields, its problem and one comment. */
function detailOf(row: OverviewRequest) {
  return {
    request: {
      id: row.id, requestNumber: row.requestNumber, priority: row.priority ?? "none", title: row.title,
      description: `What people run into on ${row.title.toLowerCase()}, as the requester wrote it.`,
      affectedPeople: "Workspace members", desiredChange: null, observedEvidence: null, uncertainty: null, usefulLink: null,
      expectedImpact: null, measurementDraft: null, designReviews: [],
      reframedProblem: null, extractedSolution: null, classification: "problem",
      status: row.status, assignedTo: row.assignedTo ?? null, createdBy: "person-alex", createdAt: row.createdAt,
      creatorName: row.creatorName, assigneeName: row.assigneeName, assigneeAvatarUrl: null,
      projectId: null, projectName: null, requestType: null, labelKeys: [],
    },
    comments: [{ id: `comment-${row.id}`, body: `First note on ${row.title}.`, createdAt: row.createdAt, authorName: "Sam Lee" }],
    attachments: [],
  }
}

/** Stubs GET /api/requests/[id] for the fixture workspace; everything else reaches the real fetch. */
function stubDetailRoute(answer: (id: string) => Response | Promise<Response> = id => {
  const row = requests.find(item => item.id === id)
  return row ? Response.json(detailOf(row)) : Response.json({ error: "This Request can’t be opened." }, { status: 404 })
}) {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    const match = /^\/api\/requests\/([^/]+)$/.exec(url.pathname)
    if (match && url.searchParams.get("org") === context.orgId) {
      calls.push(decodeURIComponent(match[1]))
      return answer(decodeURIComponent(match[1]))
    }
    return originalFetch(input, init)
  }
  return { calls, restore: () => { globalThis.fetch = originalFetch } }
}
let route: ReturnType<typeof stubDetailRoute> | undefined

const meta = {
  title: "Patterns/Request preview",
  component: LinearRequestsFixture,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/", query: {} } } },
  args: { requests, isGuest: false, context, viewer },
  // As in the authenticated layout, the pending-mutation overlay shows each move in the next frame.
  render: args => <PendingMutationsProvider><LinearRequestsFixture {...args} /></PendingMutationsProvider>,
  beforeEach: () => {
    route = stubDetailRoute()
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] })
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    mocked(undoMarkDone).mockReset().mockResolvedValue({ success: true, status: "in_progress" })
    mocked(setRequestPriority).mockReset().mockImplementation(async (_id, priority) => ({ success: true as const, priority: priority as RequestPriority }))
    mocked(addComment).mockReset().mockImplementation(async () => ({ success: true as const, comment: { id: "fixture-new-comment", createdAt: new Date() } }))
    // The pane's reviewer, release and outcome panels (#58–#60) read on their own; their stories cover them.
    // Held pending here, so each stays in its loading state and the preview's own behaviour is what is tested.
    const pending = () => new Promise<never>(() => {})
    mocked(readReviews).mockReset().mockImplementation(pending)
    mocked(loadReviewerPeople).mockReset().mockImplementation(pending)
    mocked(readRequestRelease).mockReset().mockImplementation(pending)
    mocked(readRequestOutcome).mockReset().mockImplementation(pending)
    for (const method of ["push", "replace", "prefetch", "refresh"] as const) getRouter()[method].mockClear()
    clearIntakeDraft(window.sessionStorage, intakeDraftScope("linear-preview-person", context.orgId))
    return () => route?.restore()
  },
} satisfies Meta<typeof LinearRequestsFixture>
export default meta
type Story = StoryObj<typeof meta>

/** The preview is for a fine pointer with room beside the list; at phone widths the list keeps full-page navigation. */
const previewAvailable = () => window.matchMedia(PREVIEW_QUERY).matches
const preview = (canvasElement: HTMLElement) => within(canvasElement).queryByRole("region", { name: "Request preview" })
/** The open preview once its entrance has settled: under reduced motion it fades in, and a fading panel is not yet visible. */
async function settledPreview(canvasElement: HTMLElement) {
  const panel = await within(canvasElement).findByRole("region", { name: "Request preview" })
  await waitFor(() => expect(getComputedStyle(panel).opacity).toBe("1"))
  return panel
}
/** The previewed Request's title: the panel's h2 (the page keeps its h1). */
async function previewTitle(canvasElement: HTMLElement) {
  const panel = await settledPreview(canvasElement)
  return waitFor(() => {
    const title = panel.querySelector<HTMLElement>("h2#request-title")
    if (!title) throw new Error("The preview has not loaded its Request yet")
    return title
  })
}
async function previewRow(canvasElement: HTMLElement, index: number) {
  const row = requestRow(canvasElement, idOf(index))
  row.focus()
  await userEvent.keyboard(" ")
  await expect(await previewTitle(canvasElement)).toHaveTextContent(requests[index].title)
  return row
}
/** On a phone Space does nothing and the row still opens the full page; each story asserts that much there. */
async function expectPhoneFallback(canvasElement: HTMLElement) {
  const row = requestRow(canvasElement, idOf(0))
  row.focus()
  await userEvent.keyboard(" ")
  // Past the panel's entrance and the read's 80 ms intent delay, so a preview that did open would show.
  await new Promise(resolve => setTimeout(resolve, 400))
  await expect(preview(canvasElement)).toBeNull()
  await expect(row).toHaveFocus()
  await expect(route?.calls).toEqual([])
}

/** Space opens the preview beside the list. Focus stays on the row, the page keeps its h1, and the full page stays one action away. */
export const OpenWithSpace: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    const canvas = within(canvasElement)
    // The first frame is the loading skeleton, in the panel's place, before the Request is read.
    requestRow(canvasElement, idOf(1)).focus()
    await userEvent.keyboard(" ")
    const opening = await canvas.findByRole("region", { name: "Request preview" })
    await expect(opening.querySelector('[aria-busy="true"]')).not.toBeNull()
    await userEvent.keyboard(" ")
    await waitFor(() => expect(preview(canvasElement)).toBeNull())
    const row = await previewRow(canvasElement, 1)
    await expect(row).toHaveFocus()
    const panel = preview(canvasElement)!
    await expect(canvas.getByRole("heading", { name: "Requests", level: 1 })).toBeVisible()
    await expect(within(panel).getByText(/What people run into on preview fixture request 2/)).toBeVisible()
    await expect(within(panel).getByText("First note on Preview fixture Request 2.")).toBeVisible()
    await expect(within(panel).getByRole("link", { name: "Open full page" })).toHaveAttribute("href", `/requests/${idOf(1)}`)
    await expect(within(panel).getByRole("button", { name: "Pick up" })).toBeVisible()
    await expect(route?.calls).toEqual([idOf(1)])
    // The list behind it is still the list: every row is there, and none moved.
    await expect(requestRow(canvasElement, idOf(5))).toBeInTheDocument()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    // Plan §2.3: transform and opacity only, no backdrop or filter; reduced motion settles with no slide.
    await expect(getComputedStyle(panel).backdropFilter).toBe("none")
    await expect(getComputedStyle(panel).filter).toBe("none")
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) await expect(getComputedStyle(panel).transform).toBe("none")
    else await waitFor(() => expect(new DOMMatrix(getComputedStyle(panel).transform).m41).toBe(0))
    // Space again on the same row closes it.
    await userEvent.keyboard(" ")
    await waitFor(() => expect(preview(canvasElement)).toBeNull())
    await expect(row).toHaveFocus()
  },
}

/** J and K move the list as always, and the preview follows the focused Request; a group header keeps the last one. */
export const JAndKMoveThePreview: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    await previewRow(canvasElement, 0)
    await userEvent.keyboard("j")
    await expect(requestRow(canvasElement, idOf(1))).toHaveFocus()
    await waitFor(async () => expect(await previewTitle(canvasElement)).toHaveTextContent(requests[1].title))
    await userEvent.keyboard("j")
    await waitFor(async () => expect(await previewTitle(canvasElement)).toHaveTextContent(requests[2].title))
    await userEvent.keyboard("k")
    await expect(requestRow(canvasElement, idOf(1))).toHaveFocus()
    await waitFor(async () => expect(await previewTitle(canvasElement)).toHaveTextContent(requests[1].title))
    // J pressed inside the preview carries on through the list.
    within(preview(canvasElement)!).getByRole("button", { name: "Close preview" }).focus()
    await userEvent.keyboard("j")
    await expect(requestRow(canvasElement, idOf(2))).toHaveFocus()
    await waitFor(async () => expect(await previewTitle(canvasElement)).toHaveTextContent(requests[2].title))
    // Past the last Open row the In Progress header takes focus; the preview keeps the last Request.
    await userEvent.keyboard("j")
    await expect(canvasElement.querySelector<HTMLElement>('[data-grid-row="g:status:in_progress"]')).toHaveFocus()
    await expect(await previewTitle(canvasElement)).toHaveTextContent(requests[2].title)
  },
}

/**
 * Acknowledgement contract: Pick up pressed in the preview shows In Progress on the row and in the
 * preview before the action answers, a second press is blocked, and the saved row keeps it.
 */
export const PickUpFromThePreview: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    let finish!: () => void
    mocked(pickUpRequest).mockImplementation(() => new Promise(resolve => { finish = () => {
      revalidateLinearPreview(idOf(0), { status: "in_progress", assignedTo: viewer.id, assigneeName: viewer.name })
      resolve({ success: true })
    } }))
    await previewRow(canvasElement, 0)
    const panel = preview(canvasElement)!
    await userEvent.click(within(panel).getByRole("button", { name: "Pick up" }))
    // Held: the row and the preview already read In Progress, and the pressed button cannot run twice.
    await waitFor(() => expect(requestRow(canvasElement, idOf(0)).querySelector('button[data-status="in_progress"]')).not.toBeNull())
    await expect(panel.querySelector('[data-detail-state-line], [data-detail-status]')).toHaveAccessibleName(/In Progress/)
    const pending = within(panel).getByRole("button", { name: "Picking up…" })
    await expect(pending).toBeDisabled()
    await userEvent.click(pending)
    await expect(pickUpRequest).toHaveBeenCalledTimes(1)
    finish()
    // Saved: the revalidated row and the preview agree, and nothing flips back, even once the
    // preview has read the Request again (this stub still answers the old Open copy, as a read
    // that raced the save would): the row's saved state wins.
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Mark Done" })).toBeEnabled())
    await waitFor(() => expect(route?.calls.filter(id => id === idOf(0)).length).toBeGreaterThanOrEqual(2))
    await new Promise(resolve => setTimeout(resolve, 200))
    await expect(requestRow(canvasElement, idOf(0)).querySelector('button[data-status="in_progress"]')).not.toBeNull()
    await expect(panel.querySelector('[data-detail-state-line], [data-detail-status]')).toHaveAccessibleName(/In Progress/)
    await expect(within(panel).getByRole("button", { name: "Mark Done" })).toBeEnabled()
  },
}

/** A refusal reverts the row and the preview together, with the failure said once. */
export const PickUpRefusalReverts: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    let finish!: (result: { error: string }) => void
    mocked(pickUpRequest).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await previewRow(canvasElement, 0)
    const panel = preview(canvasElement)!
    await userEvent.click(within(panel).getByRole("button", { name: "Pick up" }))
    await waitFor(() => expect(requestRow(canvasElement, idOf(0)).querySelector('button[data-status="in_progress"]')).not.toBeNull())
    finish({ error: "Someone else picked this up first." })
    // The toast fades in on motion values under reduced motion, so wait for it to settle.
    const message = await within(document.body).findByText("Someone else picked this up first.")
    await waitFor(() => expect(message).toBeVisible())
    await waitFor(() => expect(requestRow(canvasElement, idOf(0)).querySelector('button[data-status="open"]')).not.toBeNull())
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Pick up" })).toBeEnabled())
  },
}

/** A comment posted in the preview shows at once and stays once saved: the preview reads the Request again. */
export const CommentFromThePreview: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    await previewRow(canvasElement, 3)
    const panel = preview(canvasElement)!
    const box = within(panel).getByRole("textbox", { name: /comment/i })
    await userEvent.type(box, "Looks right to me.")
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")
    await expect(await within(panel).findByText("Looks right to me.")).toBeVisible()
    await expect(addComment).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(route?.calls.filter(id => id === idOf(3)).length).toBeGreaterThanOrEqual(2))
  },
}

/** Esc closes the preview and puts focus back on the previewed row, from the row or from inside the preview. The next Esc clears the selection. */
export const EscReturnsFocusToTheRow: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    const row = await previewRow(canvasElement, 2)
    within(preview(canvasElement)!).getByRole("link", { name: "Open full page" }).focus()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(preview(canvasElement)).toBeNull())
    await expect(row).toHaveFocus()
    // With a selection, the first Esc closes the preview and the second clears the selection.
    await userEvent.keyboard("x")
    await waitFor(() => expect(row).toHaveAttribute("aria-selected", "true"))
    await userEvent.keyboard(" ")
    await previewTitle(canvasElement)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(preview(canvasElement)).toBeNull())
    await expect(row).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(row).toHaveAttribute("aria-selected", "false"))
    // Close preview does the same as Esc.
    await userEvent.keyboard(" ")
    await userEvent.click(within(await within(canvasElement).findByRole("region", { name: "Request preview" })).getByRole("button", { name: "Close preview" }))
    await waitFor(() => expect(preview(canvasElement)).toBeNull())
    await expect(row).toHaveFocus()
  },
}

/** Esc while typing a comment belongs to the comment box; the preview stays open. */
export const EscWhileTypingStaysOpen: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    await previewRow(canvasElement, 1)
    const box = within(preview(canvasElement)!).getByRole("textbox", { name: /comment/i })
    await userEvent.click(box)
    await userEvent.type(box, "Half a thought")
    await userEvent.keyboard("{Escape}")
    await new Promise(resolve => setTimeout(resolve, 300))
    await expect(preview(canvasElement)).not.toBeNull()
    await expect(box).toHaveValue("Half a thought")
  },
}

/** A filter that leaves the previewed Request out of the view closes the preview; the list keeps the filter. */
export const ViewChangeClosesThePreview: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    await previewRow(canvasElement, 0)
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Done/ }))
    await waitFor(() => expect(preview(canvasElement)).toBeNull())
    await expect(requestRow(canvasElement, idOf(5))).toBeInTheDocument()
    await expect(requestRow(canvasElement, idOf(0))).toBeNull()
  },
}

/** The row menu offers Preview with its key, and Open full page records the list's order for detail's J and K. */
export const RowMenuAndFullPage: Story = {
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    const row = requestRow(canvasElement, idOf(4))
    row.focus()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    const menu = within(await within(document.body).findByRole("menu", { name: /^Request LAN-/ }))
    const item = menu.getByRole("menuitem", { name: /Preview/ })
    await expect(item).toHaveTextContent("Space")
    await userEvent.click(item)
    await expect(await previewTitle(canvasElement)).toHaveTextContent(requests[4].title)
    const open = within(preview(canvasElement)!).getByRole("link", { name: "Open full page" })
    await expect(open).toHaveAttribute("href", `/requests/${idOf(4)}`)
  },
}

/** A Request this person may not see reads as the page does: unavailable, with no other detail. */
export const Unavailable: Story = {
  beforeEach: () => {
    route?.restore()
    route = stubDetailRoute(() => Response.json({ error: "This Request can’t be opened." }, { status: 404 }))
  },
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    requestRow(canvasElement, idOf(0)).focus()
    await userEvent.keyboard(" ")
    const panel = await settledPreview(canvasElement)
    await expect(await within(panel).findByText("This Request can’t be opened")).toBeVisible()
    await expect(within(panel).queryByRole("button", { name: "Pick up" })).not.toBeInTheDocument()
  },
}

/** A guest's preview is their detail page: the same sections and no lifecycle action. */
export const Guest: Story = {
  args: { isGuest: true },
  play: async ({ canvasElement }) => {
    if (!previewAvailable()) return expectPhoneFallback(canvasElement)
    await previewRow(canvasElement, 0)
    const panel = preview(canvasElement)!
    await expect(within(panel).queryByRole("button", { name: "Pick up" })).not.toBeInTheDocument()
    await expect(within(panel).getByRole("region", { name: /Conversation/i })).toBeVisible()
    await expect(within(panel).getByRole("textbox", { name: /comment/i })).toBeVisible()
  },
}

/** Phones (a coarse pointer, or no room beside the list) keep full-page navigation: Space does nothing, Enter opens the page. */
export const Phone: Story = {
  beforeEach: () => {
    const matchMedia = window.matchMedia
    window.matchMedia = query => query === PREVIEW_QUERY ? { ...matchMedia.call(window, query), matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} } as MediaQueryList : matchMedia.call(window, query)
    return () => { window.matchMedia = matchMedia }
  },
  play: async ({ canvasElement }) => {
    await expectPhoneFallback(canvasElement)
    const row = requestRow(canvasElement, idOf(0))
    row.focus()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    const menu = within(await within(document.body).findByRole("menu", { name: /^Request LAN-/ }))
    await expect(menu.queryByRole("menuitem", { name: /Preview/ })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("menu")).toBeNull())
    const link = row.querySelector<HTMLAnchorElement>("a[data-request-title]")!
    await expect(link).toHaveAttribute("href", `/requests/${idOf(0)}`)
    let opened = false
    link.addEventListener("click", () => { opened = true }, { once: true })
    row.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(opened).toBe(true))
  },
}
