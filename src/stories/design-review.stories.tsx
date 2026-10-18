import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, within } from "storybook/test"
import { DesignReview } from "@/app/(app)/requests/[id]/design-review"
import { RequestDesignLink } from "@/components/requests/request-design-link"
import { waitingReview } from "./helpers/request-detail-fixture"

const figmaUrl = "https://www.figma.com/design/example?node-id=1-2"
const meta = {
  title: "Requests/Design link",
  component: RequestDesignLink,
  decorators: [(Story) => <main style={{ padding: "var(--space-4)" }}><Story /></main>],
} satisfies Meta<typeof RequestDesignLink>
export default meta
type Story = StoryObj<typeof meta>

export const OpenInFigma: Story = {
  args: { relatedLink: figmaUrl },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole("link", { name: /Open in Figma/ })
    await expect(link).toHaveAttribute("href", figmaUrl)
    await expect(link).toHaveAttribute("target", "_blank")
    await expect(link).toHaveAttribute("rel", "noopener noreferrer")
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument()
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const ExistingDesignReference: Story = {
  args: { reviews: waitingReview.reviews },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: /Open design/ })).toHaveAttribute("href", waitingReview.reviews[0].designUrl)
    await expect(canvas.queryByText("Waiting for review")).not.toBeInTheDocument()
    await expect(canvas.queryByRole("list", { name: "Reviewers" })).not.toBeInTheDocument()
  },
}

export const CurrentFigmaLinkTakesPrecedence: Story = {
  args: { relatedLink: figmaUrl, reviews: waitingReview.reviews },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole("link")).toHaveLength(1)
    await expect(canvas.getByRole("link")).toHaveAttribute("href", figmaUrl)
  },
}

export const NoDesignLink: Story = {
  args: { relatedLink: "https://example.com/research", reviews: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("region", { name: "Design" })).not.toBeInTheDocument()
  },
}

export const UnsafeLegacyLink: Story = {
  args: { reviews: [{ ...waitingReview.reviews[0], designUrl: "javascript:alert(1)" }] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("link")).not.toBeInTheDocument()
  },
}

/** Older imports must not restore the retired reviewer forms. */
export const LegacyEntryIsLinkOnly: Story = {
  render: () => <DesignReview requestId="fixture-request" initialState={waitingReview} currentUserId="viewer" canRequest canManage context={{ orgId: "fixture" }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: /Open design/ })).toHaveAttribute("href", waitingReview.reviews[0].designUrl)
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument()
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
    await expect(canvas.queryByText("Ask for review")).not.toBeInTheDocument()
  },
}
