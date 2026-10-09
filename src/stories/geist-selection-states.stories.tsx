import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useState } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import ChipGroup from "@/components/arc/chip-group/chip-group"
import { Select } from "@/components/arc/select/select"
import { Pagination } from "@/components/arc/pagination/pagination"
import { UserMenu } from "@/components/arc/user-menu/user-menu"
import { controlContrast } from "./helpers/rendered-colours"

function SelectionSpecimen() {
  const [status, setStatus] = useState("all")
  const [properties, setProperties] = useState(["status"])
  const [grouping, setGrouping] = useState("status")
  const [page, setPage] = useState(2)
  return <main style={{ maxWidth: "36rem", margin: "0 auto", padding: "var(--space-6)", display: "grid", gap: "var(--space-6)" }}>
    <header><h1>Selection states</h1><p>The same blue marks each saved choice.</p></header>
    <section aria-label="Request view"><h2>Status</h2><SegmentedControl label="Request status" value={status} onValueChange={setStatus} options={[{ value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "done", label: "Done" }]} /></section>
    <section aria-label="Request properties"><h2>Visible properties</h2><ChipGroup label="Visible properties" value={properties} onValueChange={setProperties} multiple options={[{ value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "owner", label: "Owner" }]} /></section>
    <Select label="Group by" value={grouping} onValueChange={setGrouping} options={[{ value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "owner", label: "Owner" }]} />
    <section aria-label="Request pages"><h2>Page</h2><Pagination page={page} pageCount={4} onPageChange={setPage} label="Request pages" /></section>
  </main>
}

const meta = {
  title: "Review/Geist selection states",
  component: SelectionSpecimen,
  parameters: { colorSystem: "geist", layout: "fullscreen" },
} satisfies Meta<typeof SelectionSpecimen>
export default meta
type Story = StoryObj<typeof meta>

function selectionColours() {
  const styles = getComputedStyle(document.documentElement)
  return {
    background: styles.getPropertyValue("--ds-blue-300").trim(),
    foreground: styles.getPropertyValue("--ds-blue-900").trim(),
  }
}

function colourBytes(value: string) {
  const context = document.createElement("canvas").getContext("2d")!
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  return [...context.getImageData(0, 0, 1, 1).data]
}

// Arc paints several selection marks beside their labels, not behind an ancestor.
// Measure actual labels/icons against that mark and the theme's exact colour pair.
async function expectSelection(surface: Element, label: Element, name: string, icons: Element[] = []) {
  await waitFor(() => {
    const colours = selectionColours()
    expect(colourBytes(getComputedStyle(surface).backgroundColor), `${name}: exact selected background`).toEqual(colourBytes(colours.background))
    expect(controlContrast(surface, colours.background), `${name}: painted selected background`).toBe(1)
    for (const content of [label, ...icons]) {
      const colour = getComputedStyle(content).color
      expect(colourBytes(colour), `${name}: exact selected foreground`).toEqual(colourBytes(colours.foreground))
      for (let node: Element | null = content; node; node = node.parentElement) expect(getComputedStyle(node).opacity).toBe("1")
      expect(controlContrast(surface, colour), `${name}: content contrast`).toBeGreaterThanOrEqual(4.5)
    }
  })
}

function segmentSurface(button: HTMLElement) {
  return button.querySelector(':scope > span[aria-hidden="true"]')!
}
function chipSurface(button: HTMLElement) {
  return button.querySelector('[data-selected="true"] > span[aria-hidden="true"]')!
}
function chipLabel(button: HTMLElement) {
  return button.querySelector('[data-selected="true"] > span:last-child')!
}

export const PersistentControls: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const statuses = within(canvas.getByRole("group", { name: "Request status" }))
    const all = statuses.getByRole("button", { name: "All" })
    await expectSelection(segmentSurface(all), all.lastElementChild!, "Status selection")
    await userEvent.tab()
    await expect(all).toHaveFocus()
    expect(getComputedStyle(all.lastElementChild!).textDecorationLine, "Selected tab has a keyboard focus cue").toBe("underline")
    await userEvent.keyboard("{ArrowRight}")
    const open = statuses.getByRole("button", { name: "Open" })
    await expect(open).toHaveFocus()
    await expect(open).toHaveAttribute("aria-pressed", "true")
    await expectSelection(segmentSurface(open), open.lastElementChild!, "Keyboard status selection")
    expect(getComputedStyle(open.lastElementChild!).textDecorationLine).toBe("underline")
    await userEvent.hover(open)
    await expectSelection(segmentSurface(open), open.lastElementChild!, "Hovered status selection")
    await userEvent.unhover(open)

    const properties = within(canvas.getByRole("group", { name: "Visible properties" }))
    const status = properties.getByRole("button", { name: "Status" })
    await expectSelection(chipSurface(status), chipLabel(status), "Property selection", [...status.querySelectorAll("svg")])
    const project = properties.getByRole("button", { name: "Project" })
    await userEvent.click(project)
    await expect(project).toHaveAttribute("aria-pressed", "true")
    await expectSelection(chipSurface(project), chipLabel(project), "Hovered property selection", [...project.querySelectorAll("svg")])
    await userEvent.unhover(project)
    await userEvent.keyboard("{ArrowRight}{ArrowLeft}")
    await expect(project).toHaveFocus()
    await expectSelection(chipSurface(project), chipLabel(project), "Focused property selection", [...project.querySelectorAll("svg")])
    expect(getComputedStyle(project.querySelector("[data-selected=true] > span:last-child")!).textDecorationLine).toBe("underline")

    const pages = canvas.getByRole("navigation", { name: "Request pages" })
    const third = within(pages).getByRole("button", { name: "Page 3" })
    await userEvent.click(third)
    await expect(third).toHaveAttribute("aria-current", "page")
    const mark = pages.querySelector(':scope > span[aria-hidden="true"]')!
    await waitFor(() => expect(Math.abs(mark.getBoundingClientRect().left - third.getBoundingClientRect().left)).toBeLessThan(.5))
    await expectSelection(mark, third, "Current page")
    await userEvent.unhover(third)
    third.focus()
    await expectSelection(mark, third, "Focused current page")
  },
}

export const SelectKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)
    const trigger = canvas.getByRole("combobox", { name: "Group by" })
    await userEvent.click(trigger)
    const selected = await body.findByRole("option", { name: "Status" })
    await expect(selected).toHaveAttribute("data-state", "checked")
    await expectSelection(selected, selected.firstElementChild!, "Selected option", [...selected.querySelectorAll("svg")])
    await userEvent.keyboard("{End}")
    const owner = body.getByRole("option", { name: "Owner" })
    await expect(owner).toHaveFocus()
    await expect(selected).toHaveAttribute("data-state", "checked")
    await expectSelection(selected, selected.firstElementChild!, "Selection after focus leaves", [...selected.querySelectorAll("svg")])
    expect(controlContrast(owner, selectionColours().background)).toBeGreaterThan(1)
    await userEvent.keyboard("{Home}")
    await expect(selected).toHaveFocus()
    await expectSelection(selected, selected.firstElementChild!, "Focused selected option", [...selected.querySelectorAll("svg")])
    expect(getComputedStyle(selected.firstElementChild!).textDecorationLine, "Selected option has a keyboard focus cue").toBe("underline")
    await userEvent.keyboard("{End}{Enter}")
    await waitFor(() => expect(body.queryByRole("listbox")).not.toBeInTheDocument())
    await userEvent.click(trigger)
    const newSelection = await body.findByRole("option", { name: "Owner" })
    await expect(newSelection).toHaveAttribute("data-state", "checked")
    await expectSelection(newSelection, newSelection.firstElementChild!, "Saved new option", [...newSelection.querySelectorAll("svg")])
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(body.queryByRole("listbox")).not.toBeInTheDocument())
  },
}

function WorkspaceSpecimen() {
  const [workspace, setWorkspace] = useState("studio")
  return <main style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)" }}>
    <h1>Account selection</h1>
    <UserMenu user={{ name: "Alex Morgan", email: "alex@example.test" }} align="start" showName showTheme
      items={[{ label: "Settings", href: "#account-settings", current: true, keys: ["G", "S"] }]}
      workspaces={{ currentId: workspace, items: [{ id: "studio", name: "Lane Studio" }, { id: "sandbox", name: "Lane Sandbox" }], onSelect: setWorkspace }} />
  </main>
}

export const WorkspaceAndTheme: Story = {
  render: () => <WorkspaceSpecimen />,
  play: async ({ canvasElement }) => {
    const body = within(document.body)
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Account menu, Alex Morgan" }))
    const settings = await body.findByRole("menuitem", { name: "Settings" })
    await expectSelection(settings, within(settings).getByText("Settings"), "Current account destination", [...settings.querySelectorAll("kbd")])
    const theme = body.getByRole("menuitemradio", { name: "System" })
    const themeMark = theme.parentElement!.querySelector(':scope > span[aria-hidden="true"]')!
    await expectSelection(themeMark, theme, "Selected theme", [...theme.querySelectorAll("svg")])
    await userEvent.click(body.getByRole("menuitem", { name: "Switch workspace" }))
    const current = await body.findByRole("menuitemradio", { name: "Lane Studio" })
    await expect(current).toHaveAttribute("aria-checked", "true")
    const workspaceLabel = within(current).getByText("Lane Studio")
    await expectSelection(current, workspaceLabel, "Current workspace", [...current.querySelectorAll("svg")])
    current.focus()
    await userEvent.keyboard("{ArrowDown}{ArrowUp}")
    await expect(current).toHaveFocus()
    await expectSelection(current, workspaceLabel, "Focused current workspace", [...current.querySelectorAll("svg")])
    expect(getComputedStyle(current.querySelector("[title=\"Lane Studio\"]")!).textDecorationLine).toBe("underline")
    await userEvent.keyboard("{Escape}")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(body.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument())
  },
}
