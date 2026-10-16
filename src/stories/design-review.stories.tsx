import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { useRef, useState } from "react"
import { Button } from "@/components/arc/button/button"
import { DesignReviewPanel, type DesignReviewPanelProps } from "@/components/requests/design-review-panel"
import { addReviewRound, recordReviewResponse, withdrawReviewRound, type RequestReviewState, type ReviewActionResult, type ReviewPerson } from "@/lib/request-review"
import { expectPinnedViewport, phoneDark } from "./helpers/request-detail-fixture"

const people: ReviewPerson[] = [{ id: "alex", name: "Alex Morgan" }, { id: "sam", name: "Sam Lee" }, { id: "taylor", name: "Taylor Chen" }]
const empty: RequestReviewState = { version: 0, reviews: [] }
const waiting: RequestReviewState = { version: 1, reviews: [{ id: "round-1", designUrl: "https://example.com/design/checkout?version=1", question: "Is the delivery date clear before payment?", requestedBy: people[0], requestedAt: "2026-10-09T10:00:00.000Z", reviewers: [people[1], people[2]], responses: [], withdrawal: null }] }
/** Round 1 with both responses in: Sam asked for a change with a note, Taylor said it looks good without one. */
const reviewed: RequestReviewState = { version: 3, reviews: [{ ...waiting.reviews[0], responses: [
  { id: "response-1", reviewerId: "sam", decision: "changes_requested", note: "Show the date before the payment step.", createdAt: "2026-10-09T10:20:00.000Z" },
  { id: "response-2", reviewerId: "taylor", decision: "looks_good", note: "", createdAt: "2026-10-09T11:05:00.000Z" },
] }] }
const fixtureTimes = ["2026-10-09T10:00:00.000Z", "2026-10-09T10:20:00.000Z", "2026-10-09T11:05:00.000Z"]
/** A twelve-person roster for the limit story. */
const dozen: ReviewPerson[] = Array.from({ length: 12 }, (_, index) => ({ id: `person-${index + 1}`, name: `Person ${String(index + 1).padStart(2, "0")}` }))
/** The route's own reply for a roster over 100 people. */
const truncated = { error: "Type a more specific name to find a reviewer" }
type FindReviewers = DesignReviewPanelProps["onFindReviewers"]
type FixtureProps = {
  initialState?: RequestReviewState; viewer?: string; guest?: boolean; failure?: "request" | "respond" | "withdraw" | "members"
  /** The save of this kind waits for the "Resolve save" demo button, so a story can read the optimistic frame first. */
  deferred?: "request" | "respond"
  /** The people the search knows; the three demo identities stay. */
  roster?: ReviewPerson[]
  /** Replaces the fixture's search, for stories that control each reply. */
  findReviewers?: FindReviewers
}

/** Only these labeled controls change demo identity. The panel receives the
 * same server-action boundary as production; domain transitions remain real. */
export function DesignReviewFixture({ initialState = empty, viewer = "alex", guest = false, failure, deferred: deferSave, roster = people, findReviewers }: FixtureProps) {
  const [actorId, setActorId] = useState(viewer)
  const saved = useRef(initialState)
  const [snapshot, setSnapshot] = useState(initialState)
  const failOnce = useRef(Boolean(failure))
  const held = useRef<(() => void) | null>(null)
  const [holding, setHolding] = useState(false)
  const actor = people.find(person => person.id === actorId)!
  const save = (kind: FixtureProps["failure"], version: number, transition: () => RequestReviewState): ReviewActionResult => {
    if (failure === kind && failOnce.current) { failOnce.current = false; return { error: "The connection was interrupted. Your draft is still here. Try again." } }
    if (version !== saved.current.version) return { error: "This review changed. Refresh the Request before trying again." }
    try { saved.current = transition(); setSnapshot(saved.current); return { state: saved.current } }
    catch (error) { return { error: error instanceof Error ? error.message : "Review could not be saved." } }
  }
  /** A deferred save answers only when "Resolve save" is pressed, like a server that has not replied yet. */
  const answer = (kind: "request" | "respond" | "withdraw", result: () => ReviewActionResult): Promise<ReviewActionResult> => {
    if (deferSave !== kind) return Promise.resolve(result())
    return new Promise(resolve => { held.current = () => { held.current = null; setHolding(false); resolve(result()) }; setHolding(true) })
  }
  const search: FindReviewers = findReviewers ?? (async query => {
    if (failure === "members" && failOnce.current) { failOnce.current = false; return { error: "Members could not be loaded. Try again." } }
    return { members: roster.filter(person => person.name.toLowerCase().includes(query.toLowerCase())) }
  })
  return <div>
    <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-control)", padding: "var(--space-3)", marginBottom: "var(--space-6)" }}>
      <legend>Demo controls: viewing as {actor.name}{guest ? " (guest)" : ""}</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {people.map(person => <Button key={person.id} variant="secondary" aria-pressed={actorId === person.id} onClick={() => setActorId(person.id)}>View as {person.name}</Button>)}
        {holding && <Button variant="secondary" onClick={() => held.current?.()}>Resolve save</Button>}
      </div>
    </fieldset>
    <DesignReviewPanel key={actorId} initialState={snapshot} currentUserId={actorId} viewer={actor} canRequest={!guest} canManage={!guest && actorId === "alex"}
      onFindReviewers={search}
      onRequest={input => answer("request", () => save("request", input.expectedVersion, () => addReviewRound(saved.current, input, roster.filter(person => input.reviewerIds.includes(person.id)), actor, "2026-10-09T10:10:00.000Z", `round-${saved.current.reviews.length + 1}`)))}
      onRespond={input => answer("respond", () => save("respond", input.expectedVersion, () => recordReviewResponse(saved.current, input, actor, "2026-10-09T10:20:00.000Z", `response-${saved.current.version + 1}`)))}
      onWithdraw={input => answer("withdraw", () => save("withdraw", input.expectedVersion, () => withdrawReviewRound(saved.current, input, actor, "2026-10-09T10:30:00.000Z", actorId === "alex")))} />
  </div>
}

const meta = {
  title: "Requests/Design review",
  component: DesignReviewFixture,
  excludeStories: ["DesignReviewFixture"],
  decorators: [(Story) => <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "var(--space-6)" }}><Story /></main>],
  parameters: { layout: "fullscreen" },
  afterEach: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector("[data-motion-pop-id]")).toBeNull()
      expect(canvasElement.getAnimations({ subtree: true }).filter(animation => animation.playState === "running")).toHaveLength(0)
    })
  },
} satisfies Meta<typeof DesignReviewFixture>
export default meta
type Story = StoryObj<typeof meta>

const page = () => within(document.body)
const reviewerRow = (canvasElement: HTMLElement, name: string) => within(within(canvasElement).getByRole("list", { name: "Reviewers" })).getByText(name).closest("li")!
const noHorizontalScroll = () => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)

/** Opens the picker, types each prefix and chooses its match, then closes it and checks the selected rows. */
async function pickReviewers(canvasElement: HTMLElement, picks: [typed: string, name: string][]) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole("button", { name: "Add reviewers" }))
  const search = await page().findByRole("searchbox", { name: "Search teammates" })
  for (const [typed, name] of picks) {
    await userEvent.clear(search)
    await userEvent.type(search, typed)
    await userEvent.click(await page().findByRole("option", { name }))
  }
  // Self is never offered: the roster excludes the viewer.
  await expect(page().queryByRole("option", { name: "Alex Morgan" })).not.toBeInTheDocument()
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(canvas.getByRole("button", { name: "Add reviewers" })).toHaveFocus())
  const selected = within(canvas.getByRole("list", { name: "Selected reviewers" }))
  for (const [, name] of picks) await expect(selected.getByText(name)).toBeVisible()
  await expect(canvas.getByText(`${picks.length} of 10 selected. Choose teammates other than yourself.`)).toBeVisible()
}

async function fillAsk(canvasElement: HTMLElement, version = "1") {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
  await userEvent.type(canvas.getByRole("textbox", { name: "Design version link" }), `https://example.com/design/checkout?version=${version}`)
  await userEvent.type(canvas.getByRole("textbox", { name: "What needs feedback?" }), "Is the delivery date clear before payment?")
  await pickReviewers(canvasElement, [["Sam", "Sam Lee"], ["Tay", "Taylor Chen"]])
}

/** The acceptance story: ask with the type-ahead, two responses, a correction, a second round and the history. */
export const AskAndRespond: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillAsk(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await expect(await canvas.findByRole("link", { name: "Open design version" })).toHaveAttribute("href", "https://example.com/design/checkout?version=1")
    await expect(canvas.getByText("Waiting for feedback")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "View as Sam Lee" }))
    await userEvent.click(canvas.getByRole("radio", { name: "Changes requested" }))
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await expect(canvas.getByRole("textbox", { name: "Feedback note" })).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(canvas.getByRole("textbox", { name: "Feedback note" }), "Show the date before the payment step.")
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Reviewers" })).getByText("Show the date before the payment step.")).toBeVisible())
    await userEvent.click(canvas.getByRole("button", { name: "View as Taylor Chen" }))
    await userEvent.click(canvas.getByRole("radio", { name: "Looks good" }))
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await expect(await canvas.findByText("Feedback received")).toBeVisible()
    // The decision stays a review label inside the section: feedback, never approval.
    await expect(within(canvas.getByRole("list", { name: "Reviewers" })).getByText("Changes requested")).toBeVisible()
    await expect(canvas.queryByText("Approved")).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "View as Sam Lee" }))
    await userEvent.click(canvas.getByRole("button", { name: "Edit your feedback" }))
    await userEvent.click(canvas.getByRole("radio", { name: "Looks good" }))
    await userEvent.clear(canvas.getByRole("textbox", { name: "Feedback note" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Feedback note" }), "The date is now clear.")
    await userEvent.click(canvas.getByRole("button", { name: "Save feedback" }))
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Reviewers" })).getByText("The date is now clear.")).toBeVisible())
    await userEvent.click(canvas.getByRole("button", { name: "View as Alex Morgan" }))
    await fillAsk(canvasElement, "2")
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    // Round 1 now sits inside the closed "Review history" details, which still exposes its own link, so read the current round only.
    await waitFor(() => expect(within(canvas.getByRole("region", { name: "Current review" })).getByRole("link", { name: "Open design version" })).toHaveAttribute("href", "https://example.com/design/checkout?version=2"))
    await userEvent.click(canvas.getByText("Review history"))
    const history = within(canvas.getByRole("region", { name: "Review round 1" }))
    await expect(within(history.getByRole("list", { name: "Reviewers" })).getByText("The date is now clear.")).toBeVisible()
    await userEvent.click(history.getByText("Response history"))
    await expect(history.getByText("Show the date before the payment step.")).toBeVisible()
    await expect(history.queryByRole("button", { name: "Edit your feedback" })).not.toBeInTheDocument()
    noHorizontalScroll()
  },
}

/** The round is on screen before the server answers, and nothing is torn down or re-added when it does. */
export const AskIsOptimisticAndNeverReverts: Story = {
  args: { deferred: "request" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillAsk(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await expect(canvas.queryByRole("form", { name: "Ask for design review" })).not.toBeInTheDocument()
    const region = canvas.getByRole("region", { name: "Current review" })
    await expect(within(region).getByText("Waiting for feedback")).toBeVisible()
    await expect(within(region).getByRole("link", { name: "Open design version" })).toHaveAttribute("href", "https://example.com/design/checkout?version=1")
    await expect(within(region).getByText("Sending…")).toBeVisible()
    await expect(canvas.getByText("Review requested.")).toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Ask for review" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("heading", { name: "Ask for review" })).toHaveFocus()
    const badge = within(region).getByText("Waiting for feedback")
    await userEvent.click(canvas.getByRole("button", { name: "Resolve save" }))
    await waitFor(() => expect(within(region).queryByText("Sending…")).not.toBeInTheDocument())
    await expect(canvas.getByRole("region", { name: "Current review" })).toBe(region)
    await expect(within(region).getByText("Waiting for feedback")).toBe(badge)
    await expect(within(region).getByRole("link", { name: "Open design version" })).toHaveAttribute("href", "https://example.com/design/checkout?version=1")
    await expect(within(region).getByText("Is the delivery date clear before payment?")).toBeVisible()
    await expect(region.querySelector("time")).toHaveAttribute("dateTime", "2026-10-09T10:10:00.000Z")
  },
}

/** A failed save takes the round away and puts the draft back, with focus on the submit so Enter retries. */
export const AskRollbackReopensDraft: Story = {
  args: { failure: "request", deferred: "request" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillAsk(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await expect(canvas.getByText("Waiting for feedback")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Resolve save" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
    await expect(canvas.getByText("Could not save the review. Your draft is back.")).toBeInTheDocument()
    await expect(canvas.getByRole("textbox", { name: "Design version link" })).toHaveValue("https://example.com/design/checkout?version=1")
    await expect(canvas.getByRole("textbox", { name: "What needs feedback?" })).toHaveValue("Is the delivery date clear before payment?")
    const selected = within(canvas.getByRole("list", { name: "Selected reviewers" }))
    await expect(selected.getByText("Sam Lee")).toBeVisible()
    await expect(selected.getByText("Taylor Chen")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Open design version" })).not.toBeInTheDocument()
    await expect(canvas.queryByText("Waiting for feedback")).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Ask for review" })).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(await canvas.findByRole("button", { name: "Resolve save" }))
    await expect(await canvas.findByText("Waiting for feedback")).toBeVisible()
    await expect(canvas.queryByRole("form", { name: "Ask for design review" })).not.toBeInTheDocument()
  },
}

/** The viewer's row shows the decision and "Sending…" in the same tick; the server time replaces it. */
export const RespondIsOptimistic: Story = {
  args: { initialState: waiting, viewer: "sam", deferred: "respond" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("radio", { name: "Looks good" }))
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await expect(canvas.queryByRole("form", { name: "Respond to design review" })).not.toBeInTheDocument()
    const row = reviewerRow(canvasElement, "Sam Lee")
    await expect(within(row).getByText("Looks good")).toBeVisible()
    await expect(within(row).getByText("Sending…")).toBeVisible()
    await expect(canvas.getByText("Feedback saved.")).toBeInTheDocument()
    await expect(within(reviewerRow(canvasElement, "Taylor Chen")).getByText("Waiting")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Resolve save" }))
    await waitFor(() => expect(within(row).queryByText("Sending…")).not.toBeInTheDocument())
    await expect(row.querySelector("time")).toHaveAttribute("dateTime", "2026-10-09T10:20:00.000Z")
    await expect(within(row).getByText("Looks good")).toBeVisible()
    await expect(within(row).getByText("Sam Lee")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Edit your feedback" })).toBeVisible()
  },
}

export const ResponseRollbackReopensDraft: Story = {
  args: { initialState: waiting, viewer: "sam", failure: "respond", deferred: "respond" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("radio", { name: "Changes requested" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Feedback note" }), "Make the delivery date easier to find.")
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await expect(within(reviewerRow(canvasElement, "Sam Lee")).getByText("Changes requested")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Resolve save" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
    await expect(canvas.getByRole("textbox", { name: "Feedback note" })).toHaveValue("Make the delivery date easier to find.")
    await expect(canvas.getByRole("radio", { name: "Changes requested" })).toBeChecked()
    await expect(within(reviewerRow(canvasElement, "Sam Lee")).getByText("Waiting")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Send feedback" })).toHaveFocus()
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await userEvent.click(await canvas.findByRole("button", { name: "Resolve save" }))
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Reviewers" })).getByText("Make the delivery date easier to find.")).toBeVisible())
  },
}

export const WithdrawAndStartAgain: Story = {
  args: { initialState: waiting, failure: "withdraw" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Withdraw review" }))
    await userEvent.click(canvas.getByRole("button", { name: "Confirm withdrawal" }))
    await expect(canvas.getByRole("textbox", { name: "Reason for withdrawal" })).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(canvas.getByRole("textbox", { name: "Reason for withdrawal" }), "This version was replaced after the usability session.")
    await userEvent.click(canvas.getByRole("button", { name: "Confirm withdrawal" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
    await expect(canvas.getByRole("textbox", { name: "Reason for withdrawal" })).toHaveValue("This version was replaced after the usability session.")
    await userEvent.click(canvas.getByRole("button", { name: "Confirm withdrawal" }))
    await expect(await canvas.findByText("Withdrawn")).toBeVisible()
    await expect(canvas.getByText("This version was replaced after the usability session.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Ask for review" })).toBeVisible()
  },
}

/** A controlled search: each reply is answered by the story, in the wrong order. */
type HeldSearch = { query: string; signal?: AbortSignal; resolve: (value: { members: ReviewPerson[] } | { error: string }) => void }
const heldSearches: HeldSearch[] = []
const holdSearches: FindReviewers = (query, signal) => {
  if (query === "") return Promise.resolve(truncated)
  return new Promise(resolve => { heldSearches.push({ query, signal, resolve }) })
}

/** On the server path, an older reply never overwrites a newer one, and the older request was aborted. */
export const ReviewerSearchLatestQueryWins: Story = {
  args: { findReviewers: holdSearches },
  play: async ({ canvasElement }) => {
    heldSearches.length = 0
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await userEvent.click(canvas.getByRole("button", { name: "Add reviewers" }))
    const search = await page().findByRole("searchbox", { name: "Search teammates" })
    await expect(await page().findByText("Type a more specific name to find a teammate.")).toBeVisible()
    await userEvent.type(search, "Sa")
    const first = await waitFor(() => { const held = heldSearches.find(item => item.query === "Sa"); expect(held).toBeDefined(); return held! })
    await userEvent.clear(search)
    await userEvent.type(search, "Tay")
    const second = await waitFor(() => { const held = heldSearches.find(item => item.query === "Tay"); expect(held).toBeDefined(); return held! })
    await expect(first.signal?.aborted).toBe(true)
    await expect(second.signal?.aborted).toBe(false)
    await expect(page().getByText("Finding teammates…")).toBeVisible()
    second.resolve({ members: [people[2]] })
    await expect(await page().findByRole("option", { name: "Taylor Chen" })).toBeVisible()
    first.resolve({ members: [people[1]] })
    await new Promise(resolve => setTimeout(resolve, 50))
    await expect(page().getByText("1 teammate matches")).toBeVisible()
    await expect(page().queryByRole("option", { name: "Sam Lee" })).not.toBeInTheDocument()
    await expect(page().getAllByRole("option")).toHaveLength(1)
  },
}

const rosterSpy = fn(async (query: string) => ({ members: people.filter(person => person.name.toLowerCase().includes(query.toLowerCase())) }))

/** With a complete roster, one request per open; every keystroke filters locally in the same tick. */
export const ReviewerRosterFiltersLocally: Story = {
  args: { findReviewers: rosterSpy },
  play: async ({ canvasElement }) => {
    rosterSpy.mockClear()
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await expect(rosterSpy).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole("button", { name: "Add reviewers" }))
    await expect(await page().findByRole("option", { name: "Sam Lee" })).toBeVisible()
    await expect(rosterSpy).toHaveBeenCalledTimes(1)
    await expect(rosterSpy).toHaveBeenCalledWith("", expect.any(AbortSignal))
    await userEvent.type(page().getByRole("searchbox", { name: "Search teammates" }), "Tay")
    await expect(page().getByRole("option", { name: "Taylor Chen" })).toBeVisible()
    await expect(page().queryByRole("option", { name: "Sam Lee" })).not.toBeInTheDocument()
    await expect(page().getByText("1 teammate matches")).toBeVisible()
    await expect(rosterSpy).toHaveBeenCalledTimes(1)
  },
}

/** A failed roster load shows an alert with Retry; a selection made after it stays listed first while typing narrows the rest. */
export const ReviewerSearchErrorRetry: Story = {
  args: { failure: "members" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await userEvent.click(canvas.getByRole("button", { name: "Add reviewers" }))
    await expect(await page().findByRole("alert")).toHaveTextContent("Could not load teammates")
    await expect(page().getByRole("alert")).toHaveTextContent("Members could not be loaded")
    await userEvent.click(page().getByRole("button", { name: "Retry" }))
    await expect(await page().findByRole("option", { name: "Sam Lee" })).toBeVisible()
    await expect(page().queryByRole("alert")).not.toBeInTheDocument()
    await userEvent.click(page().getByRole("option", { name: "Sam Lee" }))
    await userEvent.type(page().getByRole("searchbox", { name: "Search teammates" }), "Taylor")
    const options = page().getAllByRole("option")
    await expect(options.map(option => option.textContent)).toEqual(["Sam Lee", "Taylor Chen"])
    await expect(options[0]).toHaveAttribute("aria-selected", "true")
    await expect(options[1]).toHaveAttribute("aria-selected", "false")
    await expect(within(canvas.getByRole("list", { name: "Selected reviewers" })).getByText("Sam Lee")).toBeVisible()
  },
}

/** Ten is the limit: the rest dim until one is removed. */
export const ReviewerLimitTen: Story = {
  args: { roster: dozen },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await userEvent.click(canvas.getByRole("button", { name: "Add reviewers" }))
    await page().findByRole("option", { name: "Person 01" })
    for (let index = 1; index <= 10; index++) await userEvent.click(page().getByRole("option", { name: `Person ${String(index).padStart(2, "0")}` }))
    await expect(page().getByText("10 of 10 selected. Remove one to add another.")).toBeVisible()
    await expect(page().getByRole("option", { name: "Person 11" })).toHaveAttribute("aria-disabled", "true")
    await expect(page().getByRole("option", { name: "Person 10" })).not.toHaveAttribute("aria-disabled")
    await userEvent.click(page().getByRole("option", { name: "Person 11" }))
    await expect(page().getByRole("option", { name: "Person 11" })).toHaveAttribute("aria-selected", "false")
    await expect(canvas.getByText("10 of 10 selected. Choose teammates other than yourself.")).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await userEvent.click(canvas.getByRole("button", { name: "Remove Person 01" }))
    await expect(canvas.getByText("9 of 10 selected. Choose teammates other than yourself.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Add reviewers" })).toHaveFocus()
    await userEvent.click(canvas.getByRole("button", { name: "Add reviewers" }))
    await expect(await page().findByRole("option", { name: "Person 11" })).not.toHaveAttribute("aria-disabled")
    await userEvent.click(page().getByRole("option", { name: "Person 11" }))
    await expect(canvas.getByText("10 of 10 selected. Choose teammates other than yourself.")).toBeVisible()
  },
}

/** Enter opens, ArrowDown enters the list, Enter toggles, ArrowUp returns to the search, Esc closes with focus on the trigger. */
export const ReviewerPickerKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    canvas.getByRole("button", { name: "Add reviewers" }).focus()
    await userEvent.keyboard("{Enter}")
    const search = await page().findByRole("searchbox", { name: "Search teammates" })
    await expect(search).toHaveFocus()
    await page().findByRole("option", { name: "Sam Lee" })
    await userEvent.keyboard("{ArrowDown}")
    await expect(page().getByRole("option", { name: "Sam Lee" })).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await expect(page().getByRole("option", { name: "Sam Lee" })).toHaveAttribute("aria-selected", "true")
    await expect(page().getByRole("option", { name: "Sam Lee" })).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    await expect(search).toHaveFocus()
    await userEvent.type(search, "Tay")
    await userEvent.keyboard("{Enter}")
    await expect(page().getByRole("option", { name: "Taylor Chen" })).toHaveAttribute("aria-selected", "true")
    // Esc closes the popover only; the Ask form stays open.
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add reviewers" })).toHaveFocus())
    await expect(canvas.getByRole("form", { name: "Ask for design review" })).toBeInTheDocument()
    const selected = within(canvas.getByRole("list", { name: "Selected reviewers" }))
    await expect(selected.getByText("Sam Lee")).toBeVisible()
    await expect(selected.getByText("Taylor Chen")).toBeVisible()
    await userEvent.keyboard("{Tab}")
    await expect(canvas.getByRole("button", { name: "Ask for review" })).toHaveFocus()
  },
}

/** After mount every time reads in the viewer's zone, with the full date and time as its title. */
export const LocalTimes: Story = {
  args: { initialState: reviewed, viewer: "sam" },
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole("region", { name: "Current review" })
    await waitFor(() => {
      const times = [...region.querySelectorAll("time")]
      expect(times.length).toBeGreaterThanOrEqual(3)
      for (const time of times) {
        expect(fixtureTimes).toContain(time.getAttribute("dateTime"))
        expect(time.textContent).toMatch(/\d:\d\d/)
        expect(time.textContent).not.toMatch(/UTC$/)
        expect(time.title.length).toBeGreaterThan(time.textContent!.length)
      }
    })
  },
}

async function expectDenseRows(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const list = canvas.getByRole("list", { name: "Reviewers" })
  const rows = within(list).getAllByRole("listitem")
  await expect(rows).toHaveLength(2)
  const withoutNote = reviewerRow(canvasElement, "Taylor Chen")
  const height = withoutNote.getBoundingClientRect().height
  await expect(height).toBeGreaterThanOrEqual(32)
  await expect(height).toBeLessThanOrEqual(48)
  for (const row of rows) {
    await expect(getComputedStyle(row).fontSize).toBe("13px")
    const name = within(row).getByText(/Sam Lee|Taylor Chen/)
    await expect(getComputedStyle(name).fontWeight).toBe("500")
  }
  await expect(reviewerRow(canvasElement, "Sam Lee").getBoundingClientRect().height).toBeGreaterThan(height)
  noHorizontalScroll()
}

/** Reviewer rows are 13px on the 32px grid: the name at 500, the decision badge and the time trailing. */
export const DenseRoundRows: Story = {
  args: { initialState: reviewed },
  play: async ({ canvasElement }) => { await expectDenseRows(canvasElement) },
}

export const DenseRoundRowsPhone: Story = {
  args: { initialState: reviewed },
  globals: phoneDark,
  play: async ({ canvasElement, globals, parameters }) => {
    await expectPinnedViewport({ globals, parameters })
    await expectDenseRows(canvasElement)
  },
}

export const GuestReadOnly: Story = {
  args: { initialState: waiting, viewer: "sam", guest: true },
  play: async ({ canvasElement }) => {
    const panel = within(within(canvasElement).getByRole("region", { name: "Ask for review" }))
    await expect(panel.getByRole("link", { name: "Open design version" })).toBeVisible()
    await expect(panel.queryByRole("button")).not.toBeInTheDocument()
    await expect(panel.queryByRole("textbox")).not.toBeInTheDocument()
    await expect(panel.getByText("Waiting for feedback")).toBeVisible()
  },
}

function RefreshFixture({ asking = false, withdrawing = false }: { asking?: boolean; withdrawing?: boolean }) {
  const [snapshot, setSnapshot] = useState(asking ? empty : waiting)
  const actor = asking || withdrawing ? people[0] : people[1]
  function update(input: { expectedVersion: number }, transition: () => RequestReviewState): Promise<ReviewActionResult> {
    if (input.expectedVersion !== snapshot.version) return Promise.resolve({ error: "This review changed. Refresh before trying again." })
    try { const state = transition(); setSnapshot(state); return Promise.resolve({ state }) }
    catch (error) { return Promise.resolve({ error: String(error) }) }
  }
  return <>
    <fieldset style={{ marginBottom: "var(--space-6)" }}><legend>Demo controls: another session</legend>
      <Button variant="secondary" onClick={() => setSnapshot(state => recordReviewResponse(state, { reviewId: state.reviews.at(-1)!.id, decision: "looks_good", note: "Taylor checked the date." }, people[2], "2026-10-09T10:21:00.000Z", "external-response"))}>Another teammate responds</Button>
      <Button variant="secondary" onClick={() => setSnapshot(state => {
        const old = state.reviews.at(-1)
        const closed = old ? withdrawReviewRound(state, { reviewId: old.id, reason: "Replaced in another session." }, people[0], "2026-10-09T10:22:00.000Z", true) : state
        return addReviewRound(closed, { designUrl: "https://example.com/design/checkout?version=2", question: "Review the replacement version." }, [people[1], people[2]], people[0], "2026-10-09T10:23:00.000Z", "round-replacement")
      })}>A new round starts</Button>
      <Button variant="secondary" onClick={() => setSnapshot(state => withdrawReviewRound(state, { reviewId: state.reviews.at(-1)!.id, reason: "Withdrawn in another session." }, people[0], "2026-10-09T10:24:00.000Z", true))}>Withdraw from another session</Button>
    </fieldset>
    <DesignReviewPanel initialState={snapshot} currentUserId={actor.id} viewer={actor} canRequest canManage={actor.id === "alex"}
      onFindReviewers={async () => ({ members: people })}
      onRequest={input => update(input, () => addReviewRound(snapshot, input, people.filter(person => input.reviewerIds.includes(person.id)), actor, "2026-10-09T10:25:00.000Z", "round-from-form"))}
      onRespond={input => update(input, () => recordReviewResponse(snapshot, input, actor, "2026-10-09T10:25:00.000Z", "response-from-form"))}
      onWithdraw={input => update(input, () => withdrawReviewRound(snapshot, input, actor, "2026-10-09T10:25:00.000Z", true))} />
  </>
}

export const RefreshKeepsResponseDraft: Story = {
  render: () => <RefreshFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("radio", { name: "Changes requested" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Feedback note" }), "My unsent response survives a newer version.")
    await userEvent.click(canvas.getByRole("button", { name: "Another teammate responds" }))
    await expect(canvas.getByRole("textbox", { name: "Feedback note" })).toHaveValue("My unsent response survives a newer version.")
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await expect(await canvas.findByText("Feedback received")).toBeVisible()
    await expect(within(canvas.getByRole("list", { name: "Reviewers" })).getByText("My unsent response survives a newer version.")).toBeVisible()
  },
}

export const NewRoundKeepsResponseDraft: Story = {
  render: () => <RefreshFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("textbox", { name: "Feedback note" }), "Feedback for the original version only.")
    await userEvent.click(canvas.getByRole("button", { name: "A new round starts" }))
    await expect(canvas.getByRole("textbox", { name: "Feedback note" })).toHaveValue("Feedback for the original version only.")
    await expect(canvas.getByRole("button", { name: "Send feedback" })).toBeDisabled()
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
    await userEvent.click(canvas.getByRole("button", { name: "Cancel edit" }))
    await userEvent.click(canvas.getByRole("button", { name: "Respond to review" }))
    await expect(canvas.getByRole("textbox", { name: "Feedback note" })).toHaveValue("")
    await expect(canvas.getByRole("button", { name: "Send feedback" })).not.toBeDisabled()
  },
}

export const NewRoundKeepsWithdrawalDraft: Story = {
  render: () => <RefreshFixture withdrawing />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Withdraw review" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Reason for withdrawal" }), "Withdraw only the old version.")
    await userEvent.click(canvas.getByRole("button", { name: "A new round starts" }))
    await expect(canvas.getByRole("textbox", { name: "Reason for withdrawal" })).toHaveValue("Withdraw only the old version.")
    await expect(canvas.getByRole("button", { name: "Confirm withdrawal" })).toBeDisabled()
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
    await expect(within(canvas.getByRole("region", { name: "Current review" })).getByText("Waiting for feedback")).toBeVisible()
  },
}

export const CompetingAskKeepsDraft: Story = {
  render: () => <RefreshFixture asking />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillAsk(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "A new round starts" }))
    await expect(canvas.getByRole("textbox", { name: "Design version link" })).toHaveValue("https://example.com/design/checkout?version=1")
    await expect(within(canvas.getByRole("list", { name: "Selected reviewers" })).getByText("Sam Lee")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Ask for review" })).toBeDisabled()
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
  },
}

export const WithdrawnRoundKeepsResponseDraft: Story = {
  render: () => <RefreshFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("textbox", { name: "Feedback note" }), "I still need this unsent feedback.")
    await userEvent.click(canvas.getByRole("button", { name: "Withdraw from another session" }))
    await expect(canvas.getByRole("textbox", { name: "Feedback note" })).toHaveValue("I still need this unsent feedback.")
    await expect(canvas.getByRole("button", { name: "Send feedback" })).toBeDisabled()
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
  },
}
