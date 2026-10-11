import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, within } from "storybook/test"
import { Component, type ReactNode } from "react"
import RootError from "@/app/error"
import AuthError from "@/app/(auth)/error"
import NotFound from "@/app/not-found"
import AppError from "@/app/(app)/error"
import { SidebarView } from "@/components/shell/sidebar-view"

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

/** Plan item 2.0: a root frame shows its h1 in the page strip. With the (app)
 * layout failed, none of its providers are mounted: no expand control, no trail. */
async function expectRootStrip(canvasElement: HTMLElement, title: string) {
  const canvas = within(canvasElement)
  const heading = canvas.getByRole("heading", { level: 1 })
  await expect(heading).toHaveTextContent(title)
  await expect(heading.closest('[data-slot="page-strip"]')).not.toBeNull()
  await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
  await expect(canvas.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument()
}

export const WorkspaceUnavailable: Story = {
  name: "(app) layout: database paused",
  render: (args) => <RootError error={pausedDatabase} reset={args.reset} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expectRootStrip(canvasElement, "Database unavailable")
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

async function expectNotFound(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await expectRootStrip(canvasElement, "Page not found")
  await expect(canvas.getByRole("heading", { name: "This page doesn’t exist" })).toBeVisible()
  await expect(canvas.getByRole("link", { name: "Go to Requests" })).toHaveAttribute("href", "/")
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
}

export const PageNotFound: Story = {
  name: "Not found",
  render: () => <NotFound />,
  play: async ({ canvasElement }) => expectNotFound(canvasElement),
}

export const PageNotFoundPhoneDark: Story = {
  name: "Not found, phone dark",
  globals: { theme: "dark", viewport: { value: "mobile", isRotated: false } },
  render: () => <NotFound />,
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth, "The browser must actually use the pinned viewport").toBe(390)
    await expectNotFound(canvasElement)
  },
}

// The (app) layout throws (getWorkspace() against a paused database) and Next
// renders src/app/error.tsx in its place. This boundary stands in for Next's.
class RootBoundary extends Component<{ children: ReactNode; reset: () => void }, { error: (Error & { digest?: string }) | null }> {
  state = { error: null as (Error & { digest?: string }) | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    return this.state.error ? <RootError error={this.state.error} reset={this.props.reset} /> : this.props.children
  }
}
function FailingAppLayout(): ReactNode {
  throw pausedDatabase
}

export const LayoutThrows: Story = {
  name: "(app) layout throws",
  render: (args) => <RootBoundary reset={args.reset}><FailingAppLayout /></RootBoundary>,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expectRootStrip(canvasElement, "Database unavailable")
    await expect(canvas.getByRole("alert")).toHaveTextContent("Lane can’t reach its database right now")
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.reset).toHaveBeenCalledOnce()
  },
}

export const AppPageErrorInShell: Story = {
  name: "(app) page error in the shell",
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/requests/fixture" } } },
  render: (args) => <SidebarView workspaceName="Lane Studio" fullName="Alex Morgan" email="alex@example.test" role="member" pathname="/requests/fixture" statusFilter="all" notifications={null} onSignOut={() => {}}>
    <AppError error={new Error("Illustrative load failure")} reset={args.reset} />
  </SidebarView>,
  play: async ({ canvasElement, args }) => {
    const main = within(within(canvasElement).getByRole("main"))
    const heading = main.getByRole("heading", { level: 1, name: "Page unavailable" })
    await expect(heading.closest('[data-slot="page-strip"]')).not.toBeNull()
    const alert = main.getByRole("alert")
    if (window.innerWidth > 640) {
      const crumbs = main.getByRole("navigation", { name: "Breadcrumb" })
      await expect(within(crumbs).getAllByRole("link").map(link => link.textContent)).toEqual(["Lane Studio", "Requests"])
      await expect(alert).not.toContainElement(crumbs)
    }
    await expect(within(alert).queryByRole("navigation")).not.toBeInTheDocument()
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }))
    await expect(args.reset).toHaveBeenCalledOnce()
  },
}
