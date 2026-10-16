import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { addComment, markDone, pickUpRequest, setRequestPriority } from "@/app/(app)/requests/[id]/actions"
import type { RequestDetail } from "@/components/requests/detail-view"
import type { RequestPriority } from "@/lib/request-constants"
import { DetailFixture, announcer, deferred, desktopLight, expectPinnedViewport, main, phoneDark, request, sequenceIds, strip } from "./helpers/request-detail-fixture"

// Plan item 2.5 (decision D1): previous and next with J and K, the arrows only
// on the previous and next buttons, Esc in layers, and the Tab path.
// Illustrative fixtures; the mocked router swaps the Request as the server would.
const neighbours: RequestDetail[] = sequenceIds.map((id, index) => id === request.id ? request
  : { ...request, id, requestNumber: 10 + index, reframedProblem: null, title: `Neighbour Request ${index + 1}`, projectId: null, projectName: null })
const opened = (id = request.id) => ({ sequence: { ids: sequenceIds, openedId: id }, focusTitleOnArrival: false })

const meta = {
  title: "Requests/Detail keyboard",
  component: DetailFixture,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/requests/fixture-request" } } },
  args: { others: neighbours, session: opened() },
  beforeEach: () => {
    mocked(addComment).mockReset().mockImplementation(async () => ({ success: true as const, comment: { id: "fixture-new-comment", createdAt: new Date() } }))
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    mocked(setRequestPriority).mockReset().mockImplementation(async (_id, priority) => ({ success: true as const, priority: priority as RequestPriority }))
    for (const method of ["push", "replace", "prefetch", "refresh"] as const) getRouter()[method].mockReset()
    try { window.sessionStorage.removeItem("lane:request-return-focus") } catch { /* storage disabled */ }
  },
} satisfies Meta<typeof DetailFixture>
export default meta
type Story = StoryObj<typeof meta>

const title = (canvasElement: HTMLElement) => within(main(canvasElement)).getByRole("heading", { level: 1 })
const sequence = (canvasElement: HTMLElement) => within(strip(canvasElement)).queryByRole("group", { name: /in the list$/ })
async function expectRing(element: HTMLElement) {
  await expect(element).toHaveFocus()
  await expect(getComputedStyle(element).outlineStyle).toBe("solid")
}

/** "2 / 5", both neighbours prefetched once idle, and J and K replace the URL and land on the new title. */
export const PreviousNext: Story = {
  globals: desktopLight,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const group = sequence(canvasElement)!
    await expect(group).toHaveAccessibleName("Request 2 of 5 in the list")
    await expect(group).toHaveTextContent("2 / 5")
    await expect(within(group).getByRole("button", { name: "Next Request" })).toHaveAttribute("data-href", "/requests/fixture-request-2")
    await waitFor(() => expect(getRouter().prefetch).toHaveBeenCalledWith("/requests/fixture-request-2", expect.anything()))
    await waitFor(() => expect(getRouter().prefetch).toHaveBeenCalledWith("/requests/fixture-request-0", expect.anything()))
    await expect(getRouter().prefetch).toHaveBeenCalledTimes(2)
    // Elsewhere on the page the arrows keep scrolling the reading column.
    title(canvasElement).focus()
    await userEvent.keyboard("{ArrowDown}")
    await expect(getRouter().replace).not.toHaveBeenCalled()
    await userEvent.keyboard("j")
    await expect(getRouter().replace).toHaveBeenCalledWith("/requests/fixture-request-2", { scroll: false })
    await waitFor(() => expect(title(canvasElement)).toHaveTextContent("Neighbour Request 3"))
    await waitFor(() => expect(title(canvasElement)).toHaveFocus())
    await expect(sequence(canvasElement)).toHaveTextContent("3 / 5")
    await userEvent.keyboard("k")
    await expect(getRouter().replace).toHaveBeenLastCalledWith("/requests/fixture-request", { scroll: false })
    await waitFor(() => expect(title(canvasElement)).toHaveTextContent(request.reframedProblem!))
    await expect(sequence(canvasElement)).toHaveTextContent("2 / 5")
  },
}

/** The arrows work from the previous and next buttons, and focus stays on that button on the new page. */
export const ArrowsOnButtons: Story = {
  globals: desktopLight,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    within(sequence(canvasElement)!).getByRole("button", { name: "Next Request" }).focus()
    await userEvent.keyboard("{ArrowDown}")
    await expect(getRouter().replace).toHaveBeenCalledWith("/requests/fixture-request-2", { scroll: false })
    await waitFor(() => expect(sequence(canvasElement)).toHaveTextContent("3 / 5"))
    await waitFor(() => expect(within(sequence(canvasElement)!).getByRole("button", { name: "Next Request" })).toHaveFocus())
    await userEvent.keyboard("{ArrowUp}")
    await waitFor(() => expect(sequence(canvasElement)).toHaveTextContent("2 / 5"))
  },
}

/** While J's page loads, the page being left keeps its "2 / 5" and the focused Next button; the new page then takes focus. */
export const SequenceHoldsWhileLoading: Story = {
  globals: desktopLight,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    // The mocked router delivers the new page only when told to, as a slow network would.
    let deliver = () => {}
    const swap = getRouter().replace.getMockImplementation()!
    getRouter().replace.mockImplementation((href: string, options?: object) => { deliver = () => swap(href, options) })
    const next = within(sequence(canvasElement)!).getByRole("button", { name: "Next Request" })
    next.focus()
    await userEvent.keyboard("{ArrowDown}")
    await expect(getRouter().replace).toHaveBeenCalledWith("/requests/fixture-request-2", { scroll: false })
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await expect(sequence(canvasElement)).toHaveTextContent("2 / 5")
    await expect(next).toBeInTheDocument()
    await expect(next).toHaveFocus()
    deliver()
    await waitFor(() => expect(sequence(canvasElement)).toHaveTextContent("3 / 5"))
    await waitFor(() => expect(within(sequence(canvasElement)!).getByRole("button", { name: "Next Request" })).toHaveFocus())
    await expect(document.activeElement).not.toBe(document.body)
  },
}

/** With Ask for review open, J and K wait: focus on the reviewer picker's trigger (plan item 2.6), or anywhere else, keeps the form and its choices. */
export const SequenceKeysWaitForOpenForm: Story = {
  globals: desktopLight,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const review = within(within(main(canvasElement)).getByRole("region", { name: "Ask for review" }))
    await userEvent.click(review.getByRole("button", { name: "Ask for review" }))
    await userEvent.click(review.getByRole("button", { name: "Add reviewers" }))
    await userEvent.click(await within(document.body).findByRole("option", { name: "Sam Lee" }))
    // Esc closes the popover only; focus returns to the trigger inside the open form.
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(review.getByRole("button", { name: "Add reviewers" })).toHaveFocus())
    await userEvent.keyboard("j")
    await userEvent.keyboard("k")
    title(canvasElement).focus()
    await userEvent.keyboard("j")
    await expect(getRouter().replace).not.toHaveBeenCalled()
    await expect(within(review.getByRole("list", { name: "Selected reviewers" })).getByText("Sam Lee")).toBeVisible()
    // Once the form is closed, J moves on again.
    await userEvent.click(review.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(review.queryByRole("form", { name: "Ask for design review" })).not.toBeInTheDocument())
    title(canvasElement).focus()
    await userEvent.keyboard("j")
    await expect(getRouter().replace).toHaveBeenCalledWith("/requests/fixture-request-2", { scroll: false })
  },
}

/** A post that fails after J moved on is never silent: a toast says where the draft is, and K finds it back in the box. */
export const CommentFailsAfterLeaving: Story = {
  globals: desktopLight,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const answer = deferred<Awaited<ReturnType<typeof addComment>>>()
    mocked(addComment).mockImplementationOnce(() => answer.promise)
    await userEvent.type(within(main(canvasElement)).getByRole("textbox", { name: "Comment" }), "A draft that must not vanish")
    await userEvent.click(within(main(canvasElement)).getByRole("button", { name: "Post comment" }))
    title(canvasElement).focus()
    await userEvent.keyboard("j")
    await waitFor(() => expect(title(canvasElement)).toHaveTextContent("Neighbour Request 3"))
    answer.reject(new Error("Fixture connection interrupted"))
    const messages = within(canvasElement).getByRole("region", { name: /^Messages/ })
    await waitFor(() => expect(messages).toHaveTextContent("Couldn’t post your comment"))
    await expect(messages).toHaveTextContent("Your draft is back in the comment box on LAN-12.")
    title(canvasElement).focus()
    await userEvent.keyboard("k")
    await waitFor(() => expect(title(canvasElement)).toHaveTextContent(request.reframedProblem!))
    await expect(within(main(canvasElement)).getByRole("textbox", { name: "Comment" })).toHaveValue("A draft that must not vanish")
  },
}

/** At the first Request, previous is disabled and K says where the list starts. */
export const FirstInList: Story = {
  globals: desktopLight,
  args: { current: neighbours[0], session: opened(sequenceIds[0]) },
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    await expect(within(sequence(canvasElement)!).getByRole("button", { name: "Previous Request" })).toBeDisabled()
    title(canvasElement).focus()
    await userEvent.keyboard("k")
    await expect(getRouter().replace).not.toHaveBeenCalled()
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent("First Request in the list."))
  },
}

/** On a phone the counter folds away; More actions holds copy and both neighbours. */
export const PreviousNextPhone: Story = {
  globals: phoneDark,
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    await expect(within(strip(canvasElement)).queryByText("2 / 5")).not.toBeVisible()
    await userEvent.click(within(strip(canvasElement)).getByRole("button", { name: "More actions" }))
    const menu = within(await within(document.body).findByRole("menu"))
    await waitFor(() => expect(menu.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Copy link", "Copy code", "Previous Request", "Next Request"]))
    await userEvent.click(menu.getByRole("menuitem", { name: "Next Request" }))
    await expect(getRouter().replace).toHaveBeenCalledWith("/requests/fixture-request-2", { scroll: false })
  },
}

/** A deep link, a reload or an arrival from search has no sequence: no counter, no previous or next, and J does nothing. */
export const NoSequenceOnDeepLink: Story = {
  args: { session: undefined },
  play: async ({ canvasElement }) => {
    await expect(sequence(canvasElement)).not.toBeInTheDocument()
    await expect(within(strip(canvasElement)).queryByRole("button", { name: /^(Previous|Next) Request$/ })).not.toBeInTheDocument()
    title(canvasElement).focus()
    await userEvent.keyboard("j")
    await expect(getRouter().replace).not.toHaveBeenCalled()
    await expect(getRouter().prefetch).not.toHaveBeenCalled()
  },
}

/** Esc closes the nearest thing first: a menu, an open form, the comment box, and only then returns to Requests. */
export const EscLayers: Story = {
  globals: desktopLight,
  args: { session: undefined },
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const page = within(main(canvasElement))
    const panel = within(main(canvasElement).querySelector<HTMLElement>("[data-detail-panel]")!)
    // A menu.
    const status = panel.getByRole("button", { name: /^Status: Open/ })
    await userEvent.click(status)
    await within(document.body).findByRole("menu", { name: "Change status" })
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument())
    await expect(getRouter().push).not.toHaveBeenCalled()
    // A hover tooltip takes the next Esc for itself, as Radix layers do; move the pointer on.
    await userEvent.unhover(status)
    await waitFor(() => expect(within(document.body).queryByRole("tooltip")).not.toBeInTheDocument())
    // An open Ask for review form, with focus inside it.
    const review = within(page.getByRole("region", { name: "Ask for review" }))
    await userEvent.click(review.getByRole("button", { name: "Ask for review" }))
    await waitFor(() => expect(review.getByRole("textbox", { name: "Design version link" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(review.queryByRole("form", { name: "Ask for design review" })).not.toBeInTheDocument())
    await waitFor(() => expect(review.getByRole("heading", { name: "Ask for review" })).toHaveFocus())
    await expect(getRouter().push).not.toHaveBeenCalled()
    // The same form open with focus elsewhere: Esc cancels it before leaving.
    await userEvent.click(review.getByRole("button", { name: "Ask for review" }))
    await waitFor(() => expect(review.getByRole("form", { name: "Ask for design review" })).toBeInTheDocument())
    title(canvasElement).focus()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(review.queryByRole("form", { name: "Ask for design review" })).not.toBeInTheDocument())
    await expect(getRouter().push).not.toHaveBeenCalled()
    // The comment box keeps its draft and hands focus to the Conversation heading.
    await userEvent.type(page.getByRole("textbox", { name: "Comment" }), "Draft to keep")
    await userEvent.keyboard("{Escape}")
    await expect(page.getByRole("heading", { name: "Conversation" })).toHaveFocus()
    await expect(page.getByRole("textbox", { name: "Comment" })).toHaveValue("Draft to keep")
    await expect(getRouter().push).not.toHaveBeenCalled()
    // Nothing left to close: back to Requests, remembering this Request for the list's focus.
    await userEvent.keyboard("{Escape}")
    await expect(getRouter().push).toHaveBeenCalledWith("/")
    await expect(window.sessionStorage.getItem("lane:request-return-focus")).toBe(request.id)
  },
}

/** The desktop Tab path: crumbs, copy, previous and next, the action, the reading column, then the panel. */
export const KeyboardPath: Story = {
  globals: desktopLight,
  // Testing Library's Tab steps into a closed <details>, which a browser skips; this Request has no link inside one.
  args: { current: { ...request, usefulLink: null } },
  play: async context => {
    await expectPinnedViewport(context)
    const { canvasElement } = context
    const root = main(canvasElement)
    const bar = within(strip(canvasElement))
    root.focus()
    const expected = [
      bar.getByRole("link", { name: "Lane Studio" }),
      bar.getByRole("link", { name: "Website" }),
      bar.getByRole("button", { name: "Copy link" }),
      bar.getByRole("button", { name: "Copy code LAN-12" }),
      bar.getByRole("button", { name: "Previous Request" }),
      bar.getByRole("button", { name: "Next Request" }),
      bar.getByRole("button", { name: "Pick up" }),
    ]
    for (const element of expected) {
      await userEvent.tab()
      await expectRing(element)
    }
    // The reading column in order, ending at the comment box (Post comment waits for text).
    const column = [...root.querySelectorAll<HTMLElement>("[data-detail-main] summary, [data-detail-main] button:not(:disabled), [data-detail-main] textarea")].filter(element => element.getClientRects().length > 0)
    for (const element of column) {
      await userEvent.tab()
      await expect(element).toHaveFocus()
    }
    await userEvent.tab()
    await expectRing(within(root.querySelector<HTMLElement>("[data-detail-panel]")!).getByRole("button", { name: /^Status: Open/ }))
    await userEvent.tab()
    await expectRing(within(root.querySelector<HTMLElement>("[data-detail-panel]")!).getByRole("button", { name: /^Priority: No priority/ }))
  },
}
