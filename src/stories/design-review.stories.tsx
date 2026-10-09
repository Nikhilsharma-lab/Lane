import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { useRef, useState } from "react"
import { Button } from "@/components/arc/button/button"
import { DesignReviewPanel } from "@/components/requests/design-review-panel"
import { addReviewRound, recordReviewResponse, withdrawReviewRound, type RequestReviewState, type ReviewActionResult, type ReviewPerson } from "@/lib/request-review"

const people: ReviewPerson[] = [{ id: "alex", name: "Alex Morgan" }, { id: "sam", name: "Sam Lee" }, { id: "taylor", name: "Taylor Chen" }]
const empty: RequestReviewState = { version: 0, reviews: [] }
const waiting: RequestReviewState = { version: 1, reviews: [{ id: "round-1", designUrl: "https://example.com/design/checkout?version=1", question: "Is the delivery date clear before payment?", requestedBy: people[0], requestedAt: "2026-10-09T10:00:00.000Z", reviewers: [people[1], people[2]], responses: [], withdrawal: null }] }
type FixtureProps = { initialState?: RequestReviewState; viewer?: string; guest?: boolean; failure?: "request" | "respond" | "withdraw" | "members" }

/** Only these labeled controls change demo identity. The panel receives the
 * same server-action boundary as production; domain transitions remain real. */
export function DesignReviewFixture({ initialState = empty, viewer = "alex", guest = false, failure }: FixtureProps) {
  const [actorId, setActorId] = useState(viewer)
  const saved = useRef(initialState)
  const [snapshot, setSnapshot] = useState(initialState)
  const failOnce = useRef(Boolean(failure))
  const actor = people.find(person => person.id === actorId)!
  const save = (kind: FixtureProps["failure"], version: number, transition: () => RequestReviewState): ReviewActionResult => {
    if (failure === kind && failOnce.current) { failOnce.current = false; return { error: "The connection was interrupted. Your draft is still here. Try again." } }
    if (version !== saved.current.version) return { error: "This review changed. Refresh the Request before trying again." }
    try { saved.current = transition(); setSnapshot(saved.current); return { state: saved.current } }
    catch (error) { return { error: error instanceof Error ? error.message : "Review could not be saved." } }
  }
  return <div>
    <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-control)", padding: "var(--space-3)", marginBottom: "var(--space-6)" }}>
      <legend>Demo controls: viewing as {actor.name}{guest ? " (guest)" : ""}</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>{people.map(person => <Button key={person.id} variant="secondary" aria-pressed={actorId === person.id} onClick={() => setActorId(person.id)}>View as {person.name}</Button>)}</div>
    </fieldset>
    <DesignReviewPanel key={actorId} initialState={snapshot} currentUserId={actorId} canRequest={!guest} canManage={!guest && actorId === "alex"}
      onFindReviewers={async query => {
        if (failure === "members" && failOnce.current) { failOnce.current = false; return { error: "Members could not be loaded. Try again." } }
        return { members: people.filter(person => person.name.toLowerCase().includes(query.toLowerCase())) }
      }}
      onRequest={async input => save("request", input.expectedVersion, () => addReviewRound(saved.current, input, people.filter(person => input.reviewerIds.includes(person.id)), actor, "2026-10-09T10:10:00.000Z", `round-${saved.current.reviews.length + 1}`))}
      onRespond={async input => save("respond", input.expectedVersion, () => recordReviewResponse(saved.current, input, actor, "2026-10-09T10:20:00.000Z", `response-${saved.current.version + 1}`))}
      onWithdraw={async input => save("withdraw", input.expectedVersion, () => withdrawReviewRound(saved.current, input, actor, "2026-10-09T10:30:00.000Z", actorId === "alex"))} />
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

async function fillAsk(canvasElement: HTMLElement, version = "1") {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
  await userEvent.type(canvas.getByRole("textbox", { name: "Design version link" }), `https://example.com/design/checkout?version=${version}`)
  await userEvent.type(canvas.getByRole("textbox", { name: "What needs feedback?" }), "Is the delivery date clear before payment?")
  await userEvent.click(await canvas.findByRole("checkbox", { name: "Sam Lee" }))
  await userEvent.click(canvas.getByRole("checkbox", { name: "Taylor Chen" }))
}

export const AskAndRespond: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillAsk(canvasElement)
    await expect(canvas.queryByRole("checkbox", { name: "Alex Morgan" })).not.toBeInTheDocument()
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
    await expect(canvas.getByText("Changes requested")).toBeVisible()
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
    await expect(await canvas.findByRole("link", { name: "Open design version" })).toHaveAttribute("href", "https://example.com/design/checkout?version=2")
    await userEvent.click(canvas.getByText("Review history"))
    const history = within(canvas.getByRole("region", { name: "Review round 1" }))
    await expect(within(history.getByRole("list", { name: "Reviewers" })).getByText("The date is now clear.")).toBeVisible()
    await userEvent.click(history.getByText("Response history"))
    await expect(history.getByText("Show the date before the payment step.")).toBeVisible()
    await expect(history.queryByRole("button", { name: "Edit your feedback" })).not.toBeInTheDocument()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const RequestFailureRetainsDraft: Story = {
  args: { failure: "request" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillAsk(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
    await expect(canvas.getByRole("textbox", { name: "Design version link" })).toHaveValue("https://example.com/design/checkout?version=1")
    await expect(canvas.getByRole("checkbox", { name: "Sam Lee" })).toBeChecked()
    await expect(canvas.queryByRole("link", { name: "Open design version" })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await expect(await canvas.findByText("Waiting for feedback")).toBeVisible()
  },
}

export const ResponseFailureRetainsDraft: Story = {
  args: { initialState: waiting, viewer: "sam", failure: "respond" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("radio", { name: "Changes requested" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Feedback note" }), "Make the delivery date easier to find.")
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Your draft is still here")
    await expect(canvas.getByRole("textbox", { name: "Feedback note" })).toHaveValue("Make the delivery date easier to find.")
    await expect(canvas.getByRole("radio", { name: "Changes requested" })).toBeChecked()
    await userEvent.click(canvas.getByRole("button", { name: "Send feedback" }))
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

export const MemberSearchRetry: Story = {
  args: { failure: "members" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Ask for review" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Members could not be loaded")
    await userEvent.click(canvas.getByRole("button", { name: "Find reviewers" }))
    await expect(await canvas.findByRole("checkbox", { name: "Sam Lee" })).toBeVisible()
    await userEvent.click(canvas.getByRole("checkbox", { name: "Sam Lee" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Search members" }), "Taylor")
    await userEvent.click(canvas.getByRole("button", { name: "Find reviewers" }))
    await expect(canvas.getByRole("checkbox", { name: "Sam Lee" })).toBeChecked()
    await expect(await canvas.findByRole("checkbox", { name: "Taylor Chen" })).toBeVisible()
  },
}

export const GuestReadOnly: Story = {
  args: { initialState: waiting, viewer: "sam", guest: true },
  play: async ({ canvasElement }) => {
    const panel = within(within(canvasElement).getByRole("region", { name: "Design review" }))
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
    <DesignReviewPanel initialState={snapshot} currentUserId={actor.id} canRequest canManage={actor.id === "alex"}
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
    await expect(canvas.getByRole("checkbox", { name: "Sam Lee" })).toBeChecked()
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
