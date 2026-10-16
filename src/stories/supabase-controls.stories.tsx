import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { Plus, ArrowRight, Download, Trash2, Circle, CircleCheck, CircleDot, TriangleAlert, CircleAlert } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Badge } from "@/components/arc/badge/badge"

function ControlsReview() {
  const [saved, setSaved] = useState(false)
  return <main className="mx-auto max-w-5xl space-y-8 p-6">
    <header className="space-y-2"><h1 style={{ fontSize: "var(--text-2xl)" }}>Arc components · Supabase styling</h1><p style={{ color: "var(--text-secondary)" }}>Buttons, inputs and badges. Switch between light and dark in the toolbar.</p></header>
    <section aria-labelledby="buttons-title" className="space-y-4"><h2 id="buttons-title">Buttons</h2>
      <div className="flex flex-wrap items-center gap-3"><Button onClick={() => setSaved(true)}>{saved ? "Request saved" : "Save Request"}</Button><Button variant="secondary">Cancel</Button><Button variant="ghost">View details</Button><Button variant="danger">Remove attachment</Button></div>
      <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="secondary">Small</Button><Button size="md" variant="secondary">Medium</Button><Button size="lg" variant="secondary">Large</Button><Button size="sm" aria-label="Add Request"><Plus size={14} /></Button></div>
      <div className="flex flex-wrap items-center gap-3"><Button disabled>Submit Request</Button><Button loading>Saving Request</Button><Button variant="secondary">Confirm the problem with your team</Button></div>
      <h3>Buttons with icons</h3>
      <div className="flex flex-wrap items-center gap-3">
        <Button><Plus size={16} aria-hidden="true" />New Request</Button>
        <Button variant="secondary"><Download size={16} aria-hidden="true" />Download file</Button>
        <Button variant="ghost">Continue<ArrowRight size={16} aria-hidden="true" /></Button>
        <Button variant="danger"><Trash2 size={16} aria-hidden="true" />Delete file</Button>
        <Button variant="secondary" aria-label="Download attachment"><Download size={16} aria-hidden="true" /></Button>
      </div>
    </section>
    <section aria-labelledby="inputs-title" className="space-y-4"><h2 id="inputs-title">Inputs</h2><div className="grid items-start gap-6 sm:grid-cols-2">
      <Input label="Request title" placeholder="Describe the problem" description="Give your teammates enough context." />
      <Input label="Related link" defaultValue="https://example.com/research" />
      <Input label="Expected result" error="Describe the result you expect." placeholder="What should improve?" />
      <Input label="Workspace" defaultValue="Lane workspace" disabled />
      <Input label="Request code" defaultValue="LAN-104" readOnly />
      <Input label="Long context" defaultValue="A longer description that remains editable when the available width is limited" />
    </div></section>
    <section aria-labelledby="badges-title" className="space-y-4"><h2 id="badges-title">Badges</h2>
      <div className="flex flex-wrap items-center gap-3">{(["neutral", "success", "info", "warning", "danger"] as const).map(tone => <Badge key={tone} tone={tone}>{tone === "neutral" ? "Open" : tone === "success" ? "Done" : tone === "info" ? "In Progress" : tone === "warning" ? "Needs attention" : "Upload failed"}</Badge>)}</div>
      <h3>Badges with icons</h3>
      <div className="flex flex-wrap items-center gap-3">
        <Badge icon={<Circle size={12} />}>Open</Badge>
        <Badge tone="success" icon={<CircleCheck size={12} />}>Done</Badge>
        <Badge tone="info" icon={<CircleDot size={12} />}>In Progress</Badge>
        <Badge tone="warning" icon={<TriangleAlert size={12} />}>Needs attention</Badge>
        <Badge tone="danger" icon={<CircleAlert size={12} />}>Upload failed</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-3"><Badge size="sm">Small badge</Badge><Badge size="md">Default badge</Badge><Badge size="sm" icon={<Plus size={12} />}>With icon</Badge><Badge>A longer label for team review</Badge></div>
      <p style={{ color: "var(--text-secondary)" }}>Geist, sentence case and Arc motion are retained.</p>
    </section>
  </main>
}
const meta = { title: "Design review/Supabase controls", parameters: { layout: "fullscreen" }, render: () => <ControlsReview /> } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
export const Review: Story = {}
export const VerifiedControls: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    // Source-backed geometry catches hooks that exist but never reach the actual component.
    await expect(parseFloat(getComputedStyle(c.getByRole("button", { name: "Medium" })).borderRadius)).toBeCloseTo(8.86154, 3)
    await expect(getComputedStyle(c.getByRole("button", { name: "Cancel" })).boxShadow).not.toBe("none")
    await expect(getComputedStyle(c.getByRole("button", { name: "Cancel" })).borderTopWidth).toBe("0px")
    await expect(getComputedStyle(c.getByText("Default badge", { exact: true }).closest("span[class*='badge']")!).paddingLeft).toBe("12px")
    const iconBadge = c.getByText("With icon", { exact: true }).closest("span[class*='badge']")!
    await expect(getComputedStyle(iconBadge).paddingInlineStart).toBe("4px")
    await expect(getComputedStyle(iconBadge).paddingInlineEnd).toBe("8px")
    const textBadge = c.getByText("Small badge", { exact: true }).closest("span[class*='badge']")!
    await expect(getComputedStyle(textBadge).paddingInlineStart).toBe("8px")
    await expect(getComputedStyle(textBadge).paddingInlineEnd).toBe("8px")
    await userEvent.tab()
    await expect(c.getByRole("button", { name: "Save Request" })).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await expect(c.getByRole("button", { name: "Request saved" })).toBeVisible()
    await userEvent.click(c.getByRole("textbox", { name: "Request title" }))
    await userEvent.type(c.getByRole("textbox", { name: "Request title" }), "Clarify onboarding")
    await expect(c.getByRole("textbox", { name: "Request title" })).toHaveValue("Clarify onboarding")
    await expect(c.getByRole("textbox", { name: "Expected result" })).toHaveAttribute("aria-invalid", "true")
    await expect(c.getByRole("button", { name: "Submit Request" })).toBeDisabled()
    await expect(c.getByRole("button", { name: "Saving Request" })).toHaveAttribute("aria-disabled", "true")
  },
}
