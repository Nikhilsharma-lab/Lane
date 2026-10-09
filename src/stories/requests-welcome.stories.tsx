import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"

import { RequestsWelcome } from "@/app/(app)/requests-welcome"
import { NewRequestProvider } from "@/components/requests/new-request-provider"
import { listProjects } from "@/app/(app)/intake/project-actions"
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"

const meta = {
  title: "Patterns/Requests welcome",
  component: RequestsWelcome,
  args: { role: "admin" },
  decorators: [(Story) => <ToastStackProvider><main><Story /></main><ToastStack /></ToastStackProvider>],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/" } },
  },
} satisfies Meta<typeof RequestsWelcome>

export default meta
type Story = StoryObj<typeof meta>

export const Admin: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "New Request" })).toHaveAttribute("href", "/intake")
    await expect(canvas.getByRole("link", { name: "Invite teammates" })).toHaveAttribute("href", "/settings/members")
    await expect(canvas.queryByRole("button", { name: /^See an example/ })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("region", { name: "Request example" })).not.toBeInTheDocument()
  },
}
export const Member: Story = {
  args: { role: "member" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "New Request" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Invite teammates" })).not.toBeInTheDocument()
  },
}
export const Guest: Story = {
  args: { role: "guest" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("Only Requests you submit appear here.")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "New Request" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Invite teammates" })).not.toBeInTheDocument()
  },
}

export const ActionKeyboard: Story = {
  beforeEach: async () => {
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] })
    await import("@/app/(app)/intake/intake-form")
  },
  render: (args) => <NewRequestProvider context={{ orgId: "welcome-fixture" }} draftOwnerId="welcome-fixture-person"><RequestsWelcome {...args} /></NewRequestProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const create = canvas.getByRole("link", { name: "New Request" })
    const invite = canvas.getByRole("link", { name: "Invite teammates" })
    await userEvent.tab()
    await expect(create).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    const dialog = await within(document.body).findByRole("dialog", { name: "New Request" })
    const title = await within(dialog).findByRole("textbox", { name: "Request title" }, { timeout: 5000 })
    await waitFor(() => expect(title).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(create).toHaveFocus())
    await userEvent.tab()
    await expect(invite).toHaveFocus()
    await expect(invite).toHaveAttribute("href", "/settings/members")
    await userEvent.tab({ shift: true })
    await expect(create).toHaveFocus()
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
  },
}
