import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import { useState } from "react"
import { renderToString } from "react-dom/server"

import { ProfileRoleForm, type ProductRole } from "@/components/settings/profile-role-form"
import { ProfileLayout, ProfileSections, ProfileSkeleton } from "@/components/settings/profile-sections"
import { SidebarView } from "@/components/shell/sidebar-view"
import { NotificationBellView } from "@/components/shell/notification-bell-view"
import { ThemePreference } from "@/app/(app)/settings/profile/theme-preference"
import { SettingsNav } from "@/app/(app)/settings/settings-nav"
import { Button as LaneButton } from "@/components/arc/button/button"

type SaveResult = { error?: string; success?: boolean }
type SaveRole = (role: ProductRole) => Promise<SaveResult>

const savePending = fn<SaveRole>()
const saveReturnedError = fn<SaveRole>()
const saveRejected = fn<SaveRole>()

function ProfileNotifications({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return <NotificationBellView compact={compact} open={open} onOpenChange={setOpen}
    unread={0} items={[]} loaded isPending={false}
    onSelect={() => {}} onMarkAllRead={() => {}} onToggleRead={() => {}} onRetry={() => {}} />
}

async function chooseRole(canvasElement: HTMLElement, label: "PM" | "Designer" | "Developer") {
  await userEvent.click(within(canvasElement).getByRole("radio", { name: label }))
}

async function expectVisibleMessage(canvasElement: HTMLElement, message: string) {
  const element = await within(canvasElement).findByText(message)
  await waitFor(() => expect(element).toBeVisible())
  await waitFor(() => expect(canvasElement.querySelector("[data-motion-pop-id]")).toBeNull())
}

function textContrast(element: HTMLElement) {
  const context = element.ownerDocument.createElement("canvas").getContext("2d")!
  const rgba = (value: string) => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data)
  }
  const over = (front: number[], back: number[]) => front.slice(0, 3).map((channel, index) => channel * front[3] / 255 + back[index] * (1 - front[3] / 255))
  const ancestors: HTMLElement[] = []
  for (let node: HTMLElement | null = element; node; node = node.parentElement) ancestors.unshift(node)
  let background = [255, 255, 255]
  for (const node of ancestors) {
    const css = getComputedStyle(node)
    expect(Number(css.opacity), "Measure the settled, fully visible text state").toBe(1)
    background = over(rgba(css.backgroundColor), background)
    if (css.backgroundImage !== "none") {
      // Refuse a solid-color contrast result for images or varying gradients.
      const stops = css.backgroundImage.match(/(?:rgba?|oklch|color)\([^)]+\)/g) ?? []
      expect(stops.length, `Unsupported background: ${css.backgroundImage}`).toBeGreaterThanOrEqual(2)
      const colors = stops.map(rgba)
      expect(colors.every((color) => color.every((channel, index) => channel === colors[0][index])), "Contrast requires a uniform background").toBe(true)
      background = over(colors[0], background)
    }
  }
  const foreground = over(rgba(getComputedStyle(element).color), background)
  const luminance = (color: number[]) => color.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const levels = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
  return { ratio: (levels[1] + 0.05) / (levels[0] + 0.05), foreground, background }
}

// Mounting a settings form must not mutate shared Arc tokens.
function SettingsChrome() {
  return (
    <>
      <header className="border-b px-4 py-4 sm:px-6">
        <h1>Settings</h1>
      </header>
      <SettingsNav isGuest={false} />
    </>
  )
}

const meta = {
  title: "Settings/Profile",
  component: ProfileRoleForm,
  args: { initialRole: "designer", onSave: fn<SaveRole>().mockResolvedValue({ success: true }) },
  decorators: [(Story) => <div className="arc-surface"><Story /></div>],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/settings/profile" } },
    docs: {
      description: {
        component: "Production Profile role form with a fixture save boundary. These stories make no backend calls and preserve the PM/Designer/Developer label contract.",
      },
    },
  },
} satisfies Meta<typeof ProfileRoleForm>

export default meta
type Story = StoryObj<typeof meta>

export const ProfileContent: Story = {
  parameters: { browserTheme: true, layout: "fullscreen" },
  render: (args) => (
    <main>
        <ProfileLayout>
          <ProfileSections
            profileForm={<ProfileRoleForm {...args} onSave={async () => ({ success: true })} />}
            appearance={<ThemePreference />}
          />
        </ProfileLayout>
    </main>
  ),
}

export const WorkspaceProfile: Story = {
  parameters: { browserTheme: true, layout: "fullscreen" },
  render: (args) => (
    <div className="arc-surface">
      <SidebarView
        workspaceName="Lane Studio"
        fullName="Nikhil Sharma"
        email="nikhil@example.test"
        role="member"
        pathname="/settings/profile"
        statusFilter="all"
        notifications={<ProfileNotifications />}
        compactNotifications={<ProfileNotifications compact />}
        onSignOut={() => {}}
      >
        <ProfileLayout>
          <ProfileSections profileForm={<ProfileRoleForm {...args} />} appearance={<ThemePreference />} />
        </ProfileLayout>
      </SidebarView>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole("heading", { name: "Settings", level: 1 })
    const section = canvas.getByRole("heading", { name: "Profile", level: 2 })
    await canvasElement.ownerDocument.fonts.ready
    const appearance = canvas.getByRole("heading", { name: "Appearance", level: 2 })
    expect(heading.getBoundingClientRect().left).toBeLessThanOrEqual(section.getBoundingClientRect().left)
    expect(Math.abs(section.getBoundingClientRect().left - appearance.getBoundingClientRect().left)).toBeLessThan(1)
    expect(canvas.getAllByRole("main")).toHaveLength(1)
    expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
  },
}

export const Loading: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <main>
      <ProfileLayout><ProfileSkeleton /></ProfileLayout>
    </main>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("status", { name: "Loading Profile settings" })).toHaveAttribute("aria-busy", "true")
  },
}

export const ServerLoadingFrame: Story = {
  parameters: { layout: "fullscreen" },
  render: () => <main><ProfileLayout><ProfileSkeleton /></ProfileLayout></main>,
  play: async () => {
    const initialHtml = renderToString(<ProfileLayout><ProfileSkeleton /></ProfileLayout>)
    const initialPage = new DOMParser().parseFromString(initialHtml, "text/html")
    expect(initialPage.querySelector("h1")?.textContent).toBe("Settings")
    expect(initialPage.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Loading Profile settings")
    expect(initialPage.querySelector('[role="status"]')?.getAttribute("aria-busy")).toBe("true")
    const contentHtml = renderToString(<ProfileLayout><span>Profile content</span></ProfileLayout>)
    expect(contentHtml).toContain("Profile content")
  },
}

export const HumanLabelsAndUnchangedState: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("radio", { name: "Designer" })).toBeChecked()
    await expect(canvas.getByRole("button", { name: "Save role" })).toBeDisabled()
    await chooseRole(canvasElement, "PM")
    await expect(canvas.getByRole("radio", { name: "PM" })).toBeChecked()
    await chooseRole(canvasElement, "Developer")
    await expect(canvas.getByRole("radio", { name: "Developer" })).toBeChecked()
  },
}

export const SavePendingAndSuccess: Story = {
  args: { onSave: savePending },
  beforeEach: () => { savePending.mockReset() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    let finishSave!: (value: SaveResult) => void
    savePending.mockImplementation(() => new Promise((resolve) => { finishSave = resolve }))
    await chooseRole(canvasElement, "Developer")
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }))
    await waitFor(() => expect(savePending).toHaveBeenCalledWith("developer"))
    await expect(canvas.getByRole("radio", { name: "Developer" })).toBeDisabled()
    await expect(await canvas.findByRole("button", { name: "Saving role…" })).toBeDisabled()
    finishSave({ success: true })
    await expectVisibleMessage(canvasElement, "Role updated.")
    await expect(canvas.getByRole("radio", { name: "Developer" })).toBeChecked()
    await expect(canvas.getByRole("radio", { name: "Developer" })).not.toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Save role" })).toBeDisabled()
    await chooseRole(canvasElement, "Designer")
    await expect(canvas.getByRole("button", { name: "Save role" })).not.toBeDisabled()
  },
}

export const ReturnedErrorRetainsDraftAndRetries: Story = {
  args: { onSave: saveReturnedError },
  beforeEach: () => {
    saveReturnedError.mockReset()
    saveReturnedError.mockResolvedValueOnce({ error: "Your role could not be saved. Try again." }).mockResolvedValue({ success: true })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await chooseRole(canvasElement, "Developer")
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }))
    await expectVisibleMessage(canvasElement, "Your role could not be saved. Try again.")
    await expect(canvas.getByRole("radio", { name: "Developer" })).toBeChecked()
    await expect(canvas.getByRole("button", { name: "Save role" })).not.toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }))
    await expectVisibleMessage(canvasElement, "Role updated.")
    await expect(saveReturnedError).toHaveBeenNthCalledWith(1, "developer")
    await expect(saveReturnedError).toHaveBeenNthCalledWith(2, "developer")
    await expect(canvas.queryByText("Your role could not be saved. Try again.")).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Save role" })).toBeDisabled()
  },
}

export const RejectedSaveRetainsDraftAndRetries: Story = {
  args: { onSave: saveRejected },
  beforeEach: () => {
    saveRejected.mockReset()
    saveRejected.mockRejectedValueOnce(new Error("Fixture network interruption")).mockResolvedValue({ success: true })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await chooseRole(canvasElement, "Developer")
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }))
    await expectVisibleMessage(canvasElement, "Your role could not be saved. Try again.")
    await expect(canvas.getByRole("radio", { name: "Developer" })).toBeChecked()
    await expect(canvas.getByRole("button", { name: "Save role" })).not.toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }))
    await expectVisibleMessage(canvasElement, "Role updated.")
    await expect(saveRejected).toHaveBeenNthCalledWith(2, "developer")
  },
}

export const ScopeIsolation: Story = {
  parameters: { layout: "fullscreen" },
  render: function Render(args) {
    const [mounted, setMounted] = useState(false)
    return (
      <div className="flex flex-1 flex-col">
        <SettingsChrome />
        <LaneButton variant="secondary" onClick={() => setMounted((value) => !value)}>
          {mounted ? "Unmount Profile content" : "Mount Profile content"}
        </LaneButton>
        <main className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 sm:py-8">
          {mounted && <div className="arc-surface"><ProfileSections profileForm={<ProfileRoleForm {...args} />} appearance={<ThemePreference />} /></div>}
        </main>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole("heading", { name: "Settings", level: 1 })
    const nav = canvas.getByRole("navigation", { name: "Settings" })
    const profileLink = within(nav).getByRole("link", { name: "Profile" })
    const membersLink = within(nav).getByRole("link", { name: "Members" })
    const toggle = canvas.getByRole("button", { name: "Mount Profile content" })
    // Compare untouched chrome, not the toggle's intentional focus/hover state.
    const readChrome = () => [heading, nav, profileLink, membersLink].map((element) => {
      const css = getComputedStyle(element)
      return Object.fromEntries([
        "font-family", "font-size", "font-weight", "line-height", "color", "background-color",
        "border-bottom-color", "border-bottom-width", "--color-accent", "--color-border", "--color-success", "--color-warning",
      ].map((property) => [property, css.getPropertyValue(property)]))
    })
    await canvasElement.ownerDocument.fonts.ready
    const before = readChrome()
    await userEvent.click(toggle)
    const role = await canvas.findByRole("group", { name: "Role" })
    expect(role.closest(".arc-surface")).not.toBeNull()
    await canvasElement.ownerDocument.fonts.ready
    expect(readChrome()).toEqual(before)
    await userEvent.click(canvas.getByRole("button", { name: "Unmount Profile content" }))
    await waitFor(() => expect(canvas.queryByRole("group", { name: "Role" })).not.toBeInTheDocument())
    expect(readChrome()).toEqual(before)
    await waitFor(() => expect(canvasElement.querySelector("[data-motion-pop-id]")).toBeNull())
  },
}

export const BrowserThemePreference: Story = {
  parameters: { browserTheme: true },
  render: () => <ThemePreference />,
  beforeEach: () => {
    const previous = localStorage.getItem("lane-storybook-theme")
    return () => {
      if (previous === null) localStorage.removeItem("lane-storybook-theme")
      else localStorage.setItem("lane-storybook-theme", previous)
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const selector = canvas.getByRole("group", { name: "Theme" })
    const initial = (within(selector).getByRole("radio", { checked: true }) as HTMLInputElement).value.replace(/^./, (letter) => letter.toUpperCase()) as "System" | "Light" | "Dark"
    const chooseTheme = async (label: "System" | "Light" | "Dark") => {
      const button = within(selector).getByRole("radio", { name: label })
      await userEvent.click(button)
      await expect(button).toBeChecked()
      await waitFor(() => expect(localStorage.getItem("lane-storybook-theme")).toBe(label.toLowerCase()))
    }
    await chooseTheme("Dark")
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveClass("dark"))
    await chooseTheme("Light")
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveClass("light"))
    await chooseTheme("System")
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveClass(system))
    await chooseTheme(initial)
  },
}

export const LongReturnedErrorWraps: Story = {
  render: (args) => (
    <main className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 sm:py-8">
      <ProfileSections
        profileForm={<ProfileRoleForm {...args} onSave={async () => ({ error: "Your role could not be saved because the connection was interrupted before the update completed. Your selected role has been kept. Check your connection and try saving again; your current workspace access has not changed." })} />}
        appearance={<ThemePreference />}
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await chooseRole(canvasElement, "Developer")
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }))
    const message = await canvas.findByText(/^Your role could not be saved because the connection was interrupted/)
    await waitFor(() => expect(message).toBeVisible())
    await canvasElement.ownerDocument.fonts.ready
    const main = canvas.getByRole("main")
    const bounds = main.getBoundingClientRect()
    const textBounds = message.getBoundingClientRect()
    expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth + 1)
    expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
    expect(textBounds.left).toBeGreaterThanOrEqual(bounds.left)
    expect(textBounds.right).toBeLessThanOrEqual(bounds.right)
    if (window.innerWidth <= 480) {
      expect(textBounds.height).toBeGreaterThan(parseFloat(getComputedStyle(message).lineHeight) * 2)
    }
    await expect(canvas.getByRole("radio", { name: "Developer" })).toBeChecked()
    await expect(canvas.getByRole("button", { name: "Save role" })).not.toBeDisabled()
    await waitFor(() => expect(textContrast(message).ratio, "Long error feedback text contrast").toBeGreaterThanOrEqual(4.5))
    canvasElement.dataset.contrastMeasurements = JSON.stringify({ "Error feedback": textContrast(message) })
    await waitFor(() => expect(canvasElement.querySelector("[data-motion-pop-id]")).toBeNull())
  },
}

export const NormalTextContrast: Story = {
  render: (args) => (
    <main className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 sm:py-8">
      <ProfileSections profileForm={<ProfileRoleForm {...args} onSave={async () => ({ success: true })} />} appearance={<ThemePreference />} />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvasElement.ownerDocument.fonts.ready
    const measurements: Record<string, ReturnType<typeof textContrast>> = {}
    const verify = async (label: string, element: HTMLElement) => {
      await waitFor(() => {
        measurements[label] = textContrast(element)
        expect(measurements[label].ratio, `${label}: ${JSON.stringify(measurements[label])}`).toBeGreaterThanOrEqual(4.5)
      })
    }
    for (const text of [
      "Profile", "Update your PM, Designer, or Developer label.", "Role",
      "This is a profile label only. It does not change what you can see or do.",
      "Appearance", "Choose how Lane looks on this browser.", "Theme",
      "Follow your device setting or choose a theme for this browser.",
    ]) await verify(text, canvas.getByText(text))
    for (const label of ["PM", "Designer", "Developer"]) await verify("Role: " + label, canvas.getByText(label))
    for (const label of ["System", "Light", "Dark"]) await verify("Theme: " + label, canvas.getByText(label))
    await chooseRole(canvasElement, "Developer")
    await verify("Selected role", canvas.getByText("Developer"))
    await verify("Enabled save button", canvas.getByText("Save role"))
    await userEvent.click(canvas.getByRole("button", { name: "Save role" }))
    await expectVisibleMessage(canvasElement, "Role updated.")
    await verify("Success feedback", canvas.getByText("Role updated."))
    canvasElement.dataset.contrastMeasurements = JSON.stringify(measurements)
  },
}

export const SelectorKeyboardRelationships: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const designer = canvas.getByRole("radio", { name: "Designer" })
    await userEvent.tab()
    await expect(designer).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    const developer = canvas.getByRole("radio", { name: "Developer" })
    await expect(developer).toBeChecked()
    await expect(developer).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    await expect(designer).toBeChecked()
    await expect(designer).toHaveFocus()
  },
}
