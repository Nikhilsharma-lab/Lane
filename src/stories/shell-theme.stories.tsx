import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { useState } from "react"
import { Button } from "@/components/arc/button/button"
import { ThemePreference } from "@/app/(app)/settings/profile/theme-preference"

function ThemeBoundaryReview() {
  const [profileMounted, setProfileMounted] = useState(true)
  return <div className="arc-surface flex flex-col gap-4 p-4">
    <p data-testid="page-reference">Page content</p>
    <Button onClick={() => setProfileMounted(value => !value)}>Toggle Profile</Button>
    <div>{profileMounted && <ThemePreference />}</div>
    <p data-testid="page-footer">Page footer</p>
  </div>
}

function readTheme(element: HTMLElement) {
  const css = getComputedStyle(element)
  return [css.fontFamily, css.color, ...["--background", "--foreground", "--accent", "--border", "--success", "--warning"].map(key => css.getPropertyValue(key))]
}

const meta = { title: "Shell/Theme", component: ThemeBoundaryReview } satisfies Meta<typeof ThemeBoundaryReview>
export default meta
type Story = StoryObj<typeof meta>

export const NestedProfileKeepsPageAndRootStable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole("group", { name: "Theme" })
    await canvasElement.ownerDocument.fonts.ready
    const root = canvasElement.ownerDocument.documentElement
    const initialRoot = readTheme(root)
    const initialPage = readTheme(canvas.getByTestId("page-reference"))
    expect(readTheme(canvas.getByTestId("page-footer"))).toEqual(initialPage)
    await userEvent.click(canvas.getByRole("button", { name: "Toggle Profile" }))
    await waitFor(() => expect(canvas.queryByRole("group", { name: "Theme" })).not.toBeInTheDocument())
    expect(readTheme(root)).toEqual(initialRoot)
    expect(readTheme(canvas.getByTestId("page-footer"))).toEqual(initialPage)
    await userEvent.click(canvas.getByRole("button", { name: "Toggle Profile" }))
    await canvas.findByRole("group", { name: "Theme" })
    expect(readTheme(root)).toEqual(initialRoot)
    expect(readTheme(canvas.getByTestId("page-reference"))).toEqual(initialPage)
  },
}

export const AppearanceUpdatesPersistentRoot: Story = {
  parameters: { browserTheme: true },
  beforeEach: () => {
    const previous = localStorage.getItem("lane-storybook-theme")
    return () => {
      if (previous === null) localStorage.removeItem("lane-storybook-theme")
      else localStorage.setItem("lane-storybook-theme", previous)
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const theme = await canvas.findByRole("group", { name: "Theme" })
    const initial = (within(theme).getByRole("radio", { checked: true }) as HTMLInputElement).value.replace(/^./, (letter) => letter.toUpperCase()) as "Dark" | "Light" | "System"
    const choose = async (name: "Dark" | "Light" | "System") => {
      await userEvent.click(within(theme).getByRole("radio", { name }))
      await expect(within(theme).getByRole("radio", { name })).toBeChecked()
    }
    const root = canvasElement.ownerDocument.documentElement
    await choose("Dark")
    await waitFor(() => expect(root).toHaveAttribute("data-theme", "dark"))
    const darkForeground = getComputedStyle(canvas.getByTestId("page-reference")).color
    await choose("Light")
    await waitFor(() => expect(root).toHaveAttribute("data-theme", "light"))
    expect(getComputedStyle(canvas.getByTestId("page-reference")).color).not.toEqual(darkForeground)
    expect(readTheme(canvas.getByTestId("page-footer"))).toEqual(readTheme(canvas.getByTestId("page-reference")))
    await choose(initial)
  },
}

export const ThemeKeyboardNavigation: Story = {
  parameters: { browserTheme: true },
  render: () => <ThemePreference />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const group = canvas.getByRole("group", { name: "Theme" })
    await userEvent.click(within(group).getByRole("radio", { name: "System" }))
    await userEvent.keyboard("{ArrowRight}")
    await expect(within(group).getByRole("radio", { name: "Light" })).toHaveFocus()
    await expect(within(group).getByRole("radio", { name: "Light" })).toBeChecked()
    await userEvent.keyboard("{ArrowRight}")
    await expect(within(group).getByRole("radio", { name: "Dark" })).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    await expect(within(group).getByRole("radio", { name: "System" })).toHaveFocus()
  },
}
