import type { StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import requestsMeta, { RequestsShellFixture } from "./requests.stories"

const meta = {
  ...requestsMeta,
  title: "Review/Sidebar Project tree",
  parameters: { ...requestsMeta.parameters, fullShell: true },
  render: (args: React.ComponentProps<typeof RequestsShellFixture>) => <RequestsShellFixture {...args} linearPreviewAutoCollapse />,
}
export default meta
type Story = StoryObj<typeof meta>

async function projectNavigation(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  if (innerWidth <= 880) await userEvent.click(canvas.getByRole("button", { name: "Expand sidebar" }))
  const navigation = await canvas.findByRole("navigation", { name: "Primary navigation" })
  await waitFor(() => expect(navigation).toBeVisible())
  return within(navigation)
}

export const CollapseAndKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const nav = await projectNavigation(canvasElement)
    const folder = nav.getByRole("button", { name: "Projects" })
    const website = nav.getByRole("link", { name: "Website" })
    await expect(folder).toHaveAttribute("aria-expanded", "true")
    await expect(website).toBeVisible()
    await userEvent.click(folder)
    await expect(folder).toHaveAttribute("aria-expanded", "false")
    await waitFor(() => expect(nav.queryByRole("link", { name: "Website" })).not.toBeInTheDocument())
    await expect(nav.getByRole("button", { name: "New Project" })).toBeVisible()
    // Storybook's simulated Tab ignores inert. Ask the browser directly whether
    // a retained, folded link can steal focus while its exit is still animating.
    website.focus()
    await expect(folder).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}{ArrowDown}")
    await expect(nav.getByRole("link", { name: "Website" })).toHaveFocus()
    await userEvent.keyboard("{End}")
    await expect(nav.getByRole("link", { name: "No Project" })).toHaveFocus()
    await userEvent.keyboard("{ArrowLeft}")
    await expect(folder).toHaveFocus()
    await expect(folder).toHaveAttribute("aria-expanded", "false")
    await userEvent.keyboard("{Enter}")
    await expect(folder).toHaveAttribute("aria-expanded", "true")
  },
}

export const PreserveProjectNavigation: Story = {
  play: async ({ canvasElement }) => {
    const nav = await projectNavigation(canvasElement)
    const website = nav.getByRole("link", { name: "Website" })
    await expect(website).toHaveAttribute("href", "/?project=11111111-1111-4111-8111-111111111111")
    website.focus()
    await userEvent.keyboard("{Shift>}{F10}{/Shift}")
    const menu = await within(document.body).findByRole("menu", { name: "Website actions" })
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Open in new tab" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("menu", { name: "Website actions" })).not.toBeInTheDocument())
    await expect(website).toHaveFocus()
    await userEvent.click(website)
    await expect(within(canvasElement).getByRole("heading", { name: "Website" })).toBeVisible()
    const visibleNav = innerWidth <= 880 ? await projectNavigation(canvasElement) : nav
    await expect(visibleNav.getByRole("link", { name: "Website" })).toHaveAttribute("aria-current", "page")
    const folder = visibleNav.getByRole("button", { name: "Projects" })
    await userEvent.click(folder)
    await expect(visibleNav.getByText("Contains the current Project")).toBeInTheDocument()
  },
}

export const CreateRevealsProject: Story = {
  play: async ({ canvasElement }) => {
    const nav = await projectNavigation(canvasElement)
    const folder = nav.getByRole("button", { name: "Projects" })
    await userEvent.click(folder)
    await userEvent.click(nav.getByRole("button", { name: "New Project" }))
    await userEvent.type(nav.getByRole("textbox", { name: "Project name" }), "Pilot workspace")
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(folder).toHaveAttribute("aria-expanded", "true"))
    await expect(nav.getByRole("link", { name: "Pilot workspace" })).toHaveAttribute("aria-current", "page")
    await expect(within(canvasElement).getByRole("heading", { name: "Pilot workspace" })).toBeVisible()
  },
}
