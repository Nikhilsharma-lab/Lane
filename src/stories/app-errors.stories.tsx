import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, within } from "storybook/test"
import RootError from "@/app/error"
import AuthError from "@/app/(auth)/error"
import NotFound from "@/app/not-found"

// Plan item 1.12. getWorkspace() in (app)/layout.tsx throws while the database is
// paused; Next renders src/app/error.tsx inside the root layout. These stories render
// the boundaries directly with a fake error and a spy reset. Axe runs on every story
// through @storybook/addon-a11y (parameters.a11y.test is "error" in preview.tsx).
type ErrorArgs = { reset: () => void }

const pausedDatabase = Object.assign(new Error("Connection terminated unexpectedly"), { digest: "story-paused-database" })

const meta: Meta<ErrorArgs> = {
  title: "Pages/App errors",
  parameters: { layout: "fullscreen" },
  args: { reset: fn() },
}
export default meta
type Story = StoryObj<ErrorArgs>

export const WorkspaceUnavailable: Story = {
  name: "(app) layout: database paused",
  render: (args) => <RootError error={pausedDatabase} reset={args.reset} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Database unavailable")
    await expect(canvas.getByRole("heading", { name: "Lane can’t reach its database right now" })).toBeVisible()
    await expect(canvas.getByRole("alert")).toHaveTextContent("Your data is safe.")
    await expect(canvas.getByRole("button", { name: "Reload" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.reset).toHaveBeenCalledOnce()
  },
}

export const AuthUnavailable: Story = {
  name: "(auth) group: database paused",
  render: (args) => <AuthError error={pausedDatabase} reset={args.reset} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "Lane sign in" })).toHaveAttribute("href", "/login")
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Database unavailable")
    await expect(canvas.getByRole("heading", { name: "Lane can’t reach its database right now" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.reset).toHaveBeenCalledOnce()
  },
}

export const PageNotFound: Story = {
  name: "Not found",
  render: () => <NotFound />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found")
    await expect(canvas.getByRole("heading", { name: "This page doesn’t exist" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Go to Requests" })).toHaveAttribute("href", "/")
  },
}
