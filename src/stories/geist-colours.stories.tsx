import type { StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import requestsMeta, { PopulatedInShell, WorkspaceSearchInShell, ConsistentToolbarFlyouts, SidebarHoverPreview } from "./requests.stories"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Alert } from "@/components/arc/alert/alert"
import { textContrast, controlContrast, rgba } from "./helpers/rendered-colours"
import rowStyles from "@/components/requests/request-rows.module.css"
import styles from "./geist-colours.module.css"

const meta = {
  ...requestsMeta,
  title: "Review/Geist colours",
  parameters: { ...requestsMeta.parameters, fullShell: true, colorSystem: "geist" },
  args: { ...requestsMeta.args, requests: requestsMeta.args.requests.slice(0, 12), context: { orgId: "org_storybook" } },
  render: PopulatedInShell.render,
}
export default meta
type Story = StoryObj<typeof meta>

export const Requests: Story = {
  play: async context => {
    await PopulatedInShell.play?.(context)
    const canvas = within(context.canvasElement)
    const main = canvas.getByRole("main")
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    await expect(document.documentElement).toHaveAttribute("data-color-system", "geist")
    await expect(getComputedStyle(main).backgroundColor).not.toBe(getComputedStyle(sidebar.parentElement!).backgroundColor)
  },
}

export const Selected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = within(canvas.getByRole("list", { name: "Open Requests" })).getAllByRole("listitem")
    const metadataSelector = '[class*="_badge_"], button[data-property="pickedUpBy"] > span'
    await userEvent.click(within(rows[0]).getByRole("checkbox"))
    await userEvent.click(within(rows[1]).getByRole("checkbox"))
    await userEvent.unhover(within(rows[1]).getByRole("checkbox"))
    await expect(canvas.getByRole("toolbar", { name: "Selected Requests" })).toBeVisible()
    await expect(getComputedStyle(rows[0]).borderBottomLeftRadius).toBe("0px")
    await expect(getComputedStyle(rows[1]).borderTopLeftRadius).toBe("0px")
    await expect(document.documentElement).toHaveAttribute("data-color-system", "geist")
    const heading = canvas.getByRole("button", { name: "Collapse Open group" })
    expect(rows[0].getBoundingClientRect().top - heading.getBoundingClientRect().bottom, "Space below the group heading").toBe(8)
    expect(rows[1].getBoundingClientRect().top, "Adjacent selected rows stay joined").toBe(rows[0].getBoundingClientRect().bottom)
    const palette = getComputedStyle(document.documentElement)
    const selectedBlue = palette.getPropertyValue("--ds-blue-300")
    const selectedContent = palette.getPropertyValue("--ds-blue-900")
    const checkContents = async (row: HTMLElement) => {
      await waitFor(() => {
        expect(rgba(getComputedStyle(row).backgroundColor)).toEqual(rgba(selectedBlue))
        for (const element of row.querySelectorAll('a, [class*="_badge_"], button[data-property] > span, button[data-property] svg')) {
          expect(rgba(getComputedStyle(element).color), element.textContent ?? "Selected content").toEqual(rgba(selectedContent))
        }
        for (const element of row.querySelectorAll(metadataSelector)) {
          expect(rgba(getComputedStyle(element).backgroundColor), "Metadata matches selected row").toEqual(rgba(selectedBlue))
          expect(getComputedStyle(element).borderTopWidth, "Metadata keeps its stroke").toBe("1px")
          expect(controlContrast(element, getComputedStyle(element).borderTopColor), "Selected metadata has a visible stroke against the row").toBeGreaterThanOrEqual(3)
        }
      })
      for (const element of row.querySelectorAll('a, [class*="_badge_"], button[data-property="pickedUpBy"] > span')) {
        expect(textContrast(element), element.textContent ?? "Selected metadata").toBeGreaterThanOrEqual(4.5)
      }
    }
    for (const row of rows.slice(0, 2)) {
      await checkContents(row)
      const owner = within(row).getByRole("button", { name: "Owner: Unassigned" }).firstElementChild!
      const status = row.querySelector('[class*="_badge_"]')!
      expect(owner.getBoundingClientRect().height).toBe(status.getBoundingClientRect().height)
    }
    // Check selected status pills and assigned initials too, then restore the two-row preview.
    for (const status of ["In Progress", "Done"]) {
      const row = within(canvas.getByRole("list", { name: `${status} Requests` })).getAllByRole("listitem")[0]
      const checkbox = within(row).getByRole("checkbox")
      await userEvent.click(checkbox)
      await checkContents(row)
      await userEvent.click(checkbox)
      await waitFor(() => expect(row.getAnimations({ subtree: true }).some(animation => animation.playState === "running")).toBe(false))
    }
    const selectedTitle = within(rows[0]).getByRole("link")
    selectedTitle.focus()
    expect(getComputedStyle(selectedTitle).textDecorationLine, "Keyboard focus remains visible on a selected row").toBe("underline")
    expect(controlContrast(rows[0], selectedBlue)).toBe(1)
    selectedTitle.blur()
  },
}

export const DeselectionClearsHighlight: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = within(canvas.getByRole("list", { name: "Open Requests" })).getAllByRole("listitem")
    const checkbox = within(rows[0]).getByRole("checkbox")
    await userEvent.click(checkbox)
    await expect(rows[0]).toHaveAttribute("data-selected")
    await userEvent.click(checkbox)
    await userEvent.unhover(checkbox)
    expect(checkbox).toHaveFocus()
    expect(rows[0]).not.toHaveAttribute("data-selected")
    expect(getComputedStyle(rows[0]).backgroundColor, "A deselected checkbox must not leave the row highlighted after pointer exit").toBe(getComputedStyle(rows[1]).backgroundColor)
    await userEvent.tab()
    const title = within(rows[0]).getByRole("link")
    expect(title).toHaveFocus()
    expect(getComputedStyle(title).backgroundColor, "Keyboard focus remains visible").not.toBe(getComputedStyle(rows[1]).backgroundColor)
  },
}

export const ToolbarMenus: Story = { play: ConsistentToolbarFlyouts.play }
export const Search: Story = { play: WorkspaceSearchInShell.play }
export const SidebarPeek: Story = { play: SidebarHoverPreview.play }

export const AccountMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    if (window.innerWidth <= 640) await userEvent.click(canvas.getByRole("button", { name: "Open navigation" }))
    await userEvent.click(within(document.body).getByRole("button", { name: "Account menu, Alex Morgan" }))
    const menu = await within(document.body).findByRole("menu")
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Settings" })).toBeVisible())
    await waitFor(() => {
      for (const item of menu.querySelectorAll('[role="menuitem"], [data-size="md"], [title="alex@example.test"]')) {
        for (let node: Element | null = item; node && node !== document.body; node = node.parentElement) {
          expect(getComputedStyle(node).opacity).toBe("1")
        }
      }
    })
    await expect(getComputedStyle(menu).getPropertyValue("--selection-background").trim()).not.toBe("")
  },
}

export const States: Story = {
  render: () => <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "var(--space-6)", display: "grid", gap: "var(--space-6)" }}>
    <header><h1 id="colour-states">Geist colour preview</h1><p>Requests controls in normal and selected states.</p></header>
    {[false, true].map(selected => <section key={String(selected)} className={selected ? rowStyles.selectionSurface : undefined} style={{ display: "grid", gap: "var(--space-4)", padding: "var(--space-4)", borderRadius: "var(--radius-control)", background: selected ? "var(--selection-background)" : "var(--surface)" }}>
      <h2>{selected ? "Selected row" : "Default surface"}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <Badge data-colour-text className={rowStyles.propertyBadge} tone="neutral">Open</Badge><Badge data-colour-text className={rowStyles.propertyBadge} tone="info">In Progress</Badge><Badge data-colour-text className={rowStyles.propertyBadge} tone="success">Done</Badge><Badge data-colour-text className={rowStyles.propertyBadge} tone="warning">Needs attention</Badge><Badge data-colour-text className={rowStyles.propertyBadge} tone="danger">Upload failed</Badge>
      </div>
      {!selected && <><div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <Button data-colour-text>Create Request</Button><Button data-colour-text variant="secondary">Add link</Button><Button data-colour-text variant="danger">Remove link</Button><Button disabled>Unavailable</Button><Button loading>Saving Request</Button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}>
        <Checkbox label={`${selected ? "Row" : "Default"} selected`} defaultChecked /><Checkbox label={`${selected ? "Row" : "Default"} unselected`} /><Checkbox label="Unavailable selection" disabled />
      </div></>}
      <a data-colour-text href="#colour-states" className={styles.link}>View related Request</a>
    </section>)}
    <section style={{ display: "grid", gap: "var(--space-2)" }}>
      <h2>Interaction colours</h2>
      {[
        ["Selection: hover", "--selection-hover", "--selection-foreground"],
        ["Selection: pressed", "--selection-pressed", "--selection-foreground"],
        ["Control: keyboard focus", "--interaction-focus", "--foreground"],
        ["Primary action: pressed", "--primary-pressed-background", "--background"],
      ].map(([label, background, foreground]) => <div key={label} data-colour-text style={{ padding: "var(--space-3)", borderRadius: "var(--radius-control)", background: `var(${background})`, color: `var(${foreground})` }}>{label}</div>)}
    </section>
    <Alert tone="danger" title="Request could not be updated">Your selection is still here. Try again.</Alert>
  </main>,
  play: async ({ canvasElement }) => {
    await document.fonts.ready
    const canvas = within(canvasElement)
    const measurements: Record<string, number> = {}
    const measure = (element: Element, state: string) => {
      const label = `${state}: ${element.textContent}`
      measurements[label] = textContrast(element)
      expect(measurements[label], label).toBeGreaterThanOrEqual(4.5)
    }
    for (const element of canvasElement.querySelectorAll('[data-colour-text], [role="alert"] strong, [role="alert"] p')) {
      measure(element, "Default")
      await userEvent.hover(element)
      await waitFor(() => expect(element.getAnimations({ subtree: true }).some(animation => animation.playState === "running")).toBe(false))
      measure(element, "Hover")
      await userEvent.unhover(element)
    }
    const primary = canvas.getAllByRole("button", { name: "Create Request" })[0]
    const resting = getComputedStyle(primary).backgroundColor
    primary.focus()
    await waitFor(() => expect(getComputedStyle(primary).backgroundColor).not.toBe(resting))
    await waitFor(() => expect(primary.getAnimations({ subtree: true }).some(animation => animation.playState === "running")).toBe(false))
    measure(primary, "Keyboard focus")
    const related = canvas.getAllByRole("link", { name: "View related Request" })[0]
    const restingLink = getComputedStyle(related).backgroundColor
    related.focus()
    await expect(getComputedStyle(related).backgroundColor).not.toBe(restingLink)
    measure(related, "Link keyboard focus")
    for (const checkbox of canvas.getAllByRole("checkbox")) {
      if (checkbox.hasAttribute("disabled")) continue
      const square = checkbox.firstElementChild!
      if (checkbox.getAttribute("data-state") === "unchecked") {
        expect(controlContrast(square, getComputedStyle(square).borderColor), "Unchecked square boundary").toBeGreaterThanOrEqual(3)
      } else {
        const fill = square.firstElementChild!
        expect(textContrast(fill), "White check on blue fill").toBeGreaterThanOrEqual(3)
      }
    }
    canvasElement.dataset.contrastMeasurements = JSON.stringify(measurements)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

// Runs after the opted-in stories to catch palette leakage during story navigation.
export const ExistingPaletteIsolated: Story = {
  tags: ["!dev", "!autodocs"],
  parameters: { colorSystem: "arc" },
  play: async () => {
    await expect(document.documentElement).not.toHaveAttribute("data-color-system")
    await expect(document.documentElement).toHaveAttribute("data-accent", "green")
    await expect(getComputedStyle(document.documentElement).getPropertyValue("--selection-background")).toBe("")
  },
}
