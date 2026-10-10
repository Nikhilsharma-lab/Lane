import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { RequestProperty } from "@/components/requests/request-properties"
import type { OverviewRequest } from "@/lib/request-overview"

const request: OverviewRequest = {
  id: "avatar-example", title: "Make saved work easier to find", reframedProblem: null,
  status: "in_progress", createdAt: "2026-10-08T09:00:00.000Z", creatorName: "Alex Morgan",
  assignedTo: "picker-sam", assigneeName: "Sam Lee",
}

const meta = {
  title: "Patterns/Requests/Picker avatar",
  component: RequestProperty,
  parameters: { layout: "centered" },
  args: { request, property: "pickedUpBy" },
  render: args => <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
    <RequestProperty request={args.request} property="status" />
    <RequestProperty {...args} />
  </div>,
} satisfies Meta<typeof RequestProperty>
export default meta
type Story = StoryObj<typeof meta>

async function expectMatchingMetadataHeight(canvasElement: HTMLElement, trigger: HTMLElement) {
  const badge = within(canvasElement).getByRole("button", { name: /^Status:/ }).firstElementChild!
  const avatar = trigger.firstElementChild!
  const badgeBounds = badge.getBoundingClientRect()
  const avatarBounds = avatar.getBoundingClientRect()
  await expect(Math.abs(avatarBounds.height - badgeBounds.height)).toBeLessThan(.1)
  await expect(Math.abs(avatarBounds.width - avatarBounds.height)).toBeLessThan(.1)
  // The trigger grows to 44px for coarse pointers only; a narrow window with a mouse keeps 32px (adc8178).
  const minimumTarget = window.matchMedia("(pointer: coarse)").matches ? 44 : 32
  await expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(minimumTarget)
  await expect(trigger.getBoundingClientRect().width).toBeGreaterThanOrEqual(minimumTarget)
}

export const Assigned: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Owner: Sam Lee" })
    await expectMatchingMetadataHeight(canvasElement, trigger)
    // The Request's creator must not be mistaken for its current picker.
    await expect(within(trigger).getByText("SL")).toBeVisible()
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const body = within(canvasElement.ownerDocument.body)
    const detail = await body.findByRole("dialog", { name: "Owner" })
    await waitFor(() => expect(within(detail).getByText("Sam Lee")).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}

export const Unassigned: Story = {
  args: { request: { ...request, assignedTo: null, assigneeName: null, status: "open" } },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Owner: Unassigned" })
    await expectMatchingMetadataHeight(canvasElement, trigger)
    await expect(trigger.querySelector("svg")).toBeInTheDocument()
    await expect(trigger.textContent).toBe("")
  },
}

export const MissingProfile: Story = {
  args: { request: { ...request, assigneeName: null } },
}

export const LongPickerName: Story = {
  args: { request: { ...request, assigneeName: "Alexandria Long Workspace Member Name" } },
}

// Deterministic image fixtures avoid third-party requests in component tests.
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNdQAAAAASUVORK5CYII="

export const WithPhoto: Story = {
  args: { request: { ...request, assigneeAvatarUrl: photo } },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Owner: Sam Lee" })
    await expectMatchingMetadataHeight(canvasElement, trigger)
    await waitFor(() => {
      const image = trigger.querySelector("img")
      expect(image?.getAttribute("src")).toBe(photo)
      expect(image?.naturalWidth).toBeGreaterThan(0)
    })
  },
}

export const UnavailablePhoto: Story = {
  args: { request: { ...request, assigneeAvatarUrl: "data:image/png;base64,broken" } },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Owner: Sam Lee" })
    await waitFor(() => expect(within(trigger).getByText("SL")).toBeVisible())
    await expect(trigger.querySelector("img")).not.toBeInTheDocument()
  },
}
