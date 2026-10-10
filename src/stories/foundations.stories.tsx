import { useSyncExternalStore } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"

const colors = [
  { title: "Surfaces and text", tokens: ["background", "surface", "surface-raised", "surface-muted", "foreground", "text-secondary", "text-muted", "border"] },
  { title: "Action and status", tokens: ["accent", "accent-strong", "accent-subtle", "success", "warning", "danger"] },
] as const
const typeTokens = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] as const
const radii = ["control", "panel", "surface", "pill"] as const
const heights = ["sm", "md", "lg"] as const
const tokenNames = [
  ...colors.flatMap(group => group.tokens.map(token => `--${token}`)),
  ...typeTokens.map(token => `--text-${token}`),
  ...radii.map(token => `--radius-${token}`),
  ...heights.map(token => `--control-height-${token}`),
]

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-accent"] })
  return () => observer.disconnect()
}

function readSnapshot() {
  const style = getComputedStyle(document.documentElement)
  return JSON.stringify(Object.fromEntries(tokenNames.map(name => [name, style.getPropertyValue(name).trim()])))
}

function useTokenValues(): Record<string, string> {
  return JSON.parse(useSyncExternalStore(subscribe, readSnapshot, () => "{}"))
}

function ColorsReference() {
  const values = useTokenValues()
  return <main className="mx-auto max-w-5xl space-y-8 p-6">
    <h1>Arc foundation colours</h1>
    <p>These swatches read the active production CSS variables. Switch the Storybook theme to inspect light and dark values.</p>
    {colors.map(group => <section key={group.title} className="space-y-4" aria-label={group.title}>
      <h2>{group.title}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {group.tokens.map(token => <div key={token} className="min-w-0">
          <dt className="flex items-center gap-3"><span aria-hidden="true" className="size-10 shrink-0 rounded-md border" style={{ backgroundColor: `var(--${token})` }} />{token}</dt>
          <dd className="break-words">{values[`--${token}`] ?? "Reading CSS…"}</dd>
        </div>)}
      </dl>
    </section>)}
  </main>
}

function TypeReference() {
  const values = useTokenValues()
  return <main className="mx-auto max-w-5xl space-y-8 p-6">
    <h1>Arc type scale</h1>
    <p>Text uses the font and size tokens from the production Arc foundation.</p>
    <dl className="space-y-6">
      {typeTokens.map(token => <div key={token} className="space-y-2">
        <dt>text-{token}: {values[`--text-${token}`] ?? "Reading CSS…"}</dt>
        <dd style={{ fontFamily: "var(--font-body)", fontSize: `var(--text-${token})`, fontWeight: 400, lineHeight: "var(--leading-body)" }}>A clearer problem for the team</dd>
      </div>)}
    </dl>
  </main>
}

function DensityReference() {
  const values = useTokenValues()
  return <main className="mx-auto max-w-5xl space-y-8 p-6">
    <h1>Arc control sizes</h1>
    <div className="flex flex-wrap items-center gap-4">
      <Button size="sm" variant="secondary">Small action</Button>
      <Button size="md">Submit Request</Button>
      <Button size="lg" variant="secondary">Confirm problem</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="Request title" placeholder="Describe the problem" />
      <Select label="Role" defaultValue="designer" options={[
        { value: "pm", label: "PM" },
        { value: "designer", label: "Designer" },
        { value: "developer", label: "Developer" },
      ]} />
    </div>
    <dl className="space-y-2">{heights.map(token => <div key={token} className="flex gap-4"><dt>control-height-{token}</dt><dd>{values[`--control-height-${token}`] ?? "Reading CSS…"}</dd></div>)}</dl>
  </main>
}

function RadiusReference() {
  const values = useTokenValues()
  return <main className="mx-auto max-w-5xl space-y-8 p-6">
    <h1>Arc shape tokens</h1>
    <dl className="grid grid-cols-2 gap-8 sm:grid-cols-4">
      {radii.map(token => <div key={token} className="space-y-3">
        <dt>radius-{token}</dt>
        <dd className="size-16 border" style={{ borderRadius: `var(--radius-${token})`, background: "var(--surface-muted)" }} />
        <dd>{values[`--radius-${token}`] ?? "Reading CSS…"}</dd>
      </div>)}
    </dl>
  </main>
}

const meta = {
  title: "Foundations/Arc application",
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "A live inventory of Arc foundation tokens and installed Arc components. Values come from the active production CSS, not a separate Storybook palette." } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Specimen: Story = {
  render: () => <main className="mx-auto max-w-3xl space-y-8 p-6">
    <header className="space-y-3">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, letterSpacing: "var(--tracking-display)" }}>Requests</h1>
      <p>Describe the problem so your team can decide what to do next.</p>
    </header>
    <div className="flex flex-wrap items-center gap-3"><Button>New Request</Button><Button variant="secondary">Filter Requests</Button><Badge tone="info">In Progress</Badge></div>
    <Input label="Request title" placeholder="Describe the problem" description="Use a short description your teammates can recognize." />
    <Alert tone="info" title="Private attachments">Only people who can access this Request can download its files.</Alert>
  </main>,
}
export const Colors: Story = { render: () => <ColorsReference /> }
export const TypeScale: Story = { render: () => <TypeReference /> }
export const Density: Story = { render: () => <DensityReference /> }
export const Radius: Story = { render: () => <RadiusReference /> }
