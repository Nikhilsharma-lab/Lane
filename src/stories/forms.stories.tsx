import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AuthInputField, AuthPasswordField } from "@/components/auth/auth-field"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import { Select } from "@/components/arc/select/select"
import { Textarea } from "@/components/arc/textarea/textarea"

const meta = {
  title: "Primitives/Form controls",
  parameters: {
    docs: { description: { component: "Official Arc Input, Textarea, Select and RadioGroup, plus Lane's Arc-backed auth fields. These fixtures check keyboard input, validation, and preserved values without service calls." } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const TextField: Story = {
  render: () => <Input label="Request title" placeholder="Describe the problem" description="Use a short description your teammates can recognize." />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Request title" })
    await userEvent.type(field, "Customers cannot find saved Requests")
    await expect(field).toHaveValue("Customers cannot find saved Requests")
    await expect(field).toHaveAccessibleDescription("Use a short description your teammates can recognize.")
  },
}

export const CompactField: Story = {
  render: () => <div className="flex flex-wrap items-end gap-2">
    <Input label="Filter Requests" placeholder="Find a Request…" />
    <Button variant="secondary">Filter status</Button>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("textbox", { name: "Filter Requests" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Filter status" })).toBeVisible()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const InvalidField: Story = {
  render: () => <Input label="Useful link" defaultValue="not a link" error="Enter a complete URL beginning with https://." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole("textbox", { name: "Useful link" })
    await expect(field).toBeInvalid()
    await expect(field).toHaveAccessibleDescription("Enter a complete URL beginning with https://.")
    await expect(canvas.getByRole("alert")).toHaveTextContent("Enter a complete URL")
  },
}

export const DisabledAndReadOnly: Story = {
  render: () => <div className="grid gap-4">
    <AuthInputField label="Unavailable workspace name" defaultValue="Lane Studio" disabled />
    <AuthInputField label="Read-only email" type="email" defaultValue="alex@example.test" readOnly description="This value is visible and can be selected." />
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("textbox", { name: "Unavailable workspace name" })).toBeDisabled()
    const readOnly = canvas.getByRole("textbox", { name: "Read-only email" })
    await expect(readOnly).not.toBeDisabled()
    await userEvent.type(readOnly, "changed")
    await expect(readOnly).toHaveValue("alex@example.test")
  },
}

export const LongFieldMessage: Story = {
  render: () => <AuthInputField
    label="Email address for the workspace invitation"
    type="email"
    defaultValue="alexandra.morgan@example.test"
    error="This invitation could not be accepted. Sign in with the email address that received the invitation, then try again."
    description="This helper is replaced by the error."
  />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText("This helper is replaced by the error.")).not.toBeInTheDocument()
    await expect(canvas.getByRole("textbox")).toBeInvalid()
  },
}

export const PasswordVisibility: Story = {
  render: () => <AuthPasswordField id="story-password" label="Password" defaultValue="example-passphrase" autoComplete="new-password" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText("Password", { exact: true })
    await expect(input).toHaveAttribute("type", "password")
    await userEvent.click(canvas.getByRole("button", { name: "Show password" }))
    await expect(input).toHaveAttribute("type", "text")
    await expect(canvas.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(canvas.getByRole("button", { name: "Hide password" }))
    await expect(input).toHaveAttribute("type", "password")
  },
}

export const SelectKeyboard: Story = {
  render: function Render() {
    const [role, setRole] = useState("pm")
    return <Select label="Role" value={role} onValueChange={setRole} options={[
      { value: "pm", label: "PM" },
      { value: "designer", label: "Designer" },
      { value: "developer", label: "Developer" },
    ]} />
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("combobox", { name: "Role" })
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(trigger)
    await waitFor(() => expect(page.getByRole("listbox")).toBeVisible())
    await userEvent.keyboard("{End}{Enter}")
    await waitFor(() => expect(trigger).toHaveTextContent("Developer"))
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}

export const DisabledSelect: Story = {
  render: () => <Select label="Unavailable role" defaultValue="designer" disabled options={[{ value: "designer", label: "Designer" }]} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("combobox", { name: "Unavailable role" })).toBeDisabled()
  },
}

export const RadioKeyboard: Story = {
  render: function Render() {
    const [role, setRole] = useState("pm")
    return <RadioGroup label="Your role" value={role} onValueChange={setRole} options={[
      { value: "pm", label: "PM" },
      { value: "designer", label: "Designer" },
      { value: "developer", label: "Developer" },
    ]} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("radio", { name: "PM" }))
    await userEvent.keyboard("{ArrowDown}")
    await waitFor(() => expect(canvas.getByRole("radio", { name: "Designer" })).toBeChecked())
    await userEvent.keyboard("{ArrowDown}")
    await waitFor(() => expect(canvas.getByRole("radio", { name: "Developer" })).toBeChecked())
    await userEvent.keyboard("{ArrowUp}")
    await waitFor(() => expect(canvas.getByRole("radio", { name: "Designer" })).toBeChecked())
  },
}

export const TextareaStates: Story = {
  render: () => <div className="grid gap-4">
    <Textarea label="Problem context" defaultValue="People lose their place when returning from a Request." description="Describe what you observed." />
    <Textarea label="Comment" error="Add a comment before posting." />
    <Textarea label="Unavailable comment" disabled defaultValue="Posting is temporarily unavailable." />
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("textbox", { name: "Problem context" })).toHaveAccessibleDescription("Describe what you observed.")
    await expect(canvas.getByRole("textbox", { name: "Comment" })).toBeInvalid()
    await expect(canvas.getByRole("textbox", { name: "Unavailable comment" })).toBeDisabled()
  },
}
