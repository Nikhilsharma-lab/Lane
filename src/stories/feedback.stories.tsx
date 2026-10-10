import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, within } from "storybook/test"
import { Alert } from "@/components/arc/alert/alert"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"

const meta = {
  title: "Composites/Feedback and identity",
  parameters: {
    docs: { description: { component: "Official Arc Alert, Skeleton and Avatar states with Lane Request copy. These examples use fixture identities and do not contact workspace services." } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PersistentFeedback: Story = {
  render: () => <div className="grid gap-4">
    <Alert tone="danger" title="Comment was not posted">Your draft is still here. Check your connection and try again.</Alert>
    <Alert tone="success" title="Role updated">Your profile now shows Designer. Your access has not changed.</Alert>
    <Alert tone="warning" title="Confirm the problem">The Request currently describes a solution. Review the problem before submitting.</Alert>
    <Alert tone="info" title="Private attachments">Only people who can access this Request can download its files.</Alert>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("alert")).toHaveTextContent("Your draft is still here")
    await expect(canvas.getAllByRole("status")).toHaveLength(3)
  },
}

export const DismissibleFeedback: Story = {
  render: function Render() {
    return <Alert tone="info" title="Private attachments" onDismiss={() => {}}>Only people who can access this Request can download its files.</Alert>
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Dismiss: Private attachments" })).toBeVisible()
  },
}

export const LongFeedback: Story = {
  render: () => <Alert tone="danger" title="The Request could not be submitted after the attachment upload finished">
    Your entered problem and context remain available. The connection was interrupted while the server confirmed the Request. Retry this step before leaving the page so you do not accidentally create another submission.
  </Alert>,
}

export const LoadingContent: Story = {
  render: () => <Skeleton label="Loading Requests" lines={4} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status", { name: "Loading Requests" })).toHaveAttribute("aria-busy", "true")
  },
}

const people = [
  { name: "Alex Morgan", detail: "alex@example.test" },
  { name: "山田 花子", detail: "Designer" },
  { name: "نور أحمد", detail: "Developer" },
  { name: "Invited teammate", detail: "invited@example.test" },
]

export const IdentityRows: Story = {
  render: () => <ul className="divide-y border rounded-xl">
    {people.map(({ name, detail }) => <li key={name} className="flex min-w-0 items-center gap-4 p-4">
      <Avatar name={name} aria-hidden="true" />
      <span className="min-w-0 flex-1"><strong className="block truncate font-medium" dir="auto">{name}</strong><span className="block truncate">{detail}</span></span>
      {name === "Alex Morgan" && <Button variant="ghost" aria-label="View Alex Morgan">View</Button>}
    </li>)}
  </ul>,
}

export const LongRowContent: Story = {
  render: () => <ul className="border rounded-xl"><li className="flex min-w-0 items-center gap-4 p-4">
    <Avatar name="Alexandra Morgan" aria-hidden="true" />
    <span className="min-w-0 flex-1"><strong className="block font-medium">Alexandra Morgan commented on understanding why a Request changed after the team reviewed its original problem.</strong><span className="block">The complete sentence wraps while the identity and action remain present.</span></span>
    <Button variant="ghost" aria-label="Mark Alexandra Morgan's notification as read">Mark read</Button>
  </li></ul>,
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    await expect(within(canvasElement).getByRole("button", { name: "Mark Alexandra Morgan's notification as read" })).toBeVisible()
  },
}
