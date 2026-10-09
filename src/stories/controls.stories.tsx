import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { Copy, Plus, Send } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { AuthAction } from "@/components/auth/auth-action"

const meta = {
  title: "Primitives/Controls",
  component: Button,
  args: { children: "New Request" },
  parameters: {
    docs: { description: { component: "Official Arc Button variants and the production AuthAction composite. Labels describe actions, including icon-only controls and pending work." } },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Variants: Story = {
  render: () => <div className="flex flex-wrap gap-4">
    <Button>Submit Request</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="ghost">Go back</Button>
    <Button variant="danger">Remove attachment</Button>
  </div>,
}

export const Sizes: Story = {
  render: () => <div className="flex flex-wrap items-center gap-4">
    <Button size="sm" variant="secondary">Small action</Button>
    <Button size="md">Submit Request</Button>
    <Button size="lg" variant="secondary">Confirm problem</Button>
  </div>,
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "New Request" })).toBeDisabled()
  },
}

export const IconButtons: Story = {
  render: () => <div className="flex flex-wrap items-center gap-4">
    <Button variant="secondary" aria-label="Copy Request link"><Copy aria-hidden="true" /></Button>
    <Button variant="secondary" aria-label="Add attachment"><Plus aria-hidden="true" /></Button>
    <Button aria-label="Submit Request"><Send aria-hidden="true" /></Button>
    <Button disabled aria-label="Submit unavailable Request"><Send aria-hidden="true" /></Button>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "Copy Request link" })).toHaveFocus()
    await expect(canvas.getByRole("button", { name: "Submit unavailable Request" })).toBeDisabled()
  },
}

export const AuthActionRoles: Story = {
  render: () => <div className="grid gap-4">
    <AuthAction kind="primary" icon={Send}>Continue</AuthAction>
    <AuthAction kind="secondary">Resend email</AuthAction>
    <AuthAction kind="tertiary">Go back</AuthAction>
    <AuthAction kind="utility" icon={Copy}>Copy code</AuthAction>
  </div>,
}

export const LoadingActions: Story = {
  render: () => <div className="flex flex-wrap gap-4">
    <Button loading>Submit Request</Button>
    <Button loading variant="secondary">Save role</Button>
    <AuthAction kind="primary" loading loadingLabel="Continuing…">Continue</AuthAction>
  </div>,
  play: async ({ canvasElement }) => {
    for (const button of within(canvasElement).getAllByRole("button")) {
      await expect(button).toHaveAttribute("aria-busy", "true")
      await expect(button).toHaveAttribute("aria-disabled", "true")
    }
  },
}

export const LongActionLabel: Story = {
  args: { children: "Confirm the reframed problem", size: "lg" },
}
