import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, waitFor } from "storybook/test"
import { Avatar } from "@/components/arc/avatar/avatar"
import { WorkspaceSidebar } from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar"
import { Button } from "@/components/arc/button/button"
import { Send, Check } from "lucide-react"
import notificationStyles from "@/components/arc/notification-center/notification-center.module.css"
import sidebarStyles from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css"

const meta = { title: "Foundations/Global token contract", parameters: { layout: "fullscreen" } } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const SharedIconSizes: Story = {
  render: () => <main className="flex flex-wrap items-center gap-4 p-6">
    <Send aria-label="Default icon" />
    {(["xs", "sm", "md", "lg", "xl", "2xl"] as const).map(size => <Send key={size} data-icon-size={size} aria-label={`${size} icon`} />)}
    <Button size="sm"><span><Send aria-label="Nested button icon" /></span>Send</Button>
    <svg data-ui-icon aria-label="Custom icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor" /></svg>
    <Check aria-label="Semantic icon" style={{ color: "var(--state-success-icon)" }} />
  </main>,
  play: async ({ canvasElement }) => {
    const root = document.documentElement
    const saved = root.getAttribute("style")
    const icon = (label: string) => canvasElement.querySelector(`[aria-label="${label}"]`)!
    const width = (label: string) => parseFloat(getComputedStyle(icon(label)).width)
    await expect(width("Default icon")).toBe(16)
    for (const [role, size] of [["xs", 12], ["sm", 14], ["md", 16], ["lg", 18], ["xl", 20], ["2xl", 24]] as const) {
      await expect(width(`${role} icon`)).toBe(size)
      await expect(parseFloat(getComputedStyle(icon(`${role} icon`)).height)).toBe(size)
    }
    await expect(width("Nested button icon")).toBe(14)
    await expect(width("Custom icon")).toBe(16)
    const colour = getComputedStyle(icon("Semantic icon")).color
    try {
      root.style.setProperty("--sb-icon-sm", "22px")
      root.style.setProperty("--sb-button-icon-tiny", "19px")
      await waitFor(() => {
        expect(width("Default icon")).toBe(22)
        expect(width("Custom icon")).toBe(22)
        expect(width("md icon")).toBe(22)
        expect(width("Nested button icon")).toBe(19)
        expect(getComputedStyle(icon("Semantic icon")).color).toBe(colour)
      })
    } finally {
      if (saved === null) root.removeAttribute("style")
      else root.setAttribute("style", saved)
    }
  },
}

export const SharedValuesPropagate: Story = {
  render: () => <main style={{ padding: "var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
    <h1>Global token propagation</h1>
    <p>This check changes global tokens, verifies shared components update, then restores the theme.</p>
    <div style={{ width: "min(100%, calc(var(--space-1) * 72))", height: "calc(var(--space-1) * 96)" }}>
      <WorkspaceSidebar forceDesktopLayout workspace={{ id: "demo", name: "Lane", initial: "L" }} user={{ name: "Alex Morgan", email: "alex@example.com" }} settingsHref="/settings/profile" projects={[]} groups={[{ id: "workspace", name: "Workspace", items: [{ id: "requests", name: "Requests", href: "/" }] }]} activeId="requests" currentPage="Requests" />
    </div>
    <section className={notificationStyles.header} data-testid="notification-header" aria-label="Notification header"><h2>Notifications</h2><button type="button" className={notificationStyles.close}>×</button></section>
    <Avatar name="Alex Morgan" size="md" data-testid="avatar" />
    <Button>New Request</Button>
  </main>,
  play: async ({ canvasElement }) => {
    const root = document.documentElement
    const saved = root.getAttribute("style")
    const avatar = canvasElement.querySelector('[data-testid="avatar"]')!
    const header = canvasElement.querySelector('[data-testid="notification-header"]')!
    const sidebarHeader = canvasElement.querySelector(`.${sidebarStyles.header}`)!
    const close = header.querySelector('button')!
    const measure = () => [parseFloat(getComputedStyle(avatar).width), parseFloat(getComputedStyle(header).paddingLeft), parseFloat(getComputedStyle(sidebarHeader).paddingLeft)]
    const before = measure()
    const radius = parseFloat(getComputedStyle(close).borderRadius)
    try {
      root.style.setProperty('--sb-spacing', '.5rem')
      root.style.setProperty('--sb-radius-md', '1rem')
      await waitFor(() => {
        measure().forEach((value, index) => expect(value).toBeCloseTo(before[index] * 2, 1))
        expect(parseFloat(getComputedStyle(close).borderRadius)).toBeCloseTo(radius * 2, 1)
      })
    } finally {
      if (saved === null) root.removeAttribute('style')
      else root.setAttribute('style', saved)
    }
    await waitFor(() => measure().forEach((value, index) => expect(value).toBeCloseTo(before[index], 1)))
  },
}
