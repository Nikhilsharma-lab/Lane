import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { SidebarView } from "@/components/shell/sidebar-view"
import { PageStrip } from "@/components/shell/page-strip"
import { Input } from "@/components/arc/input/input"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"

const meta = {
  title: "Navigation/Sidebar resizing",
  component: SidebarView,
  parameters: { layout: "fullscreen" },
  args: {
    workspaceName: "Lane Studio", fullName: "Alex Morgan", email: "alex@example.test", role: "member",
    pathname: "/settings/profile", statusFilter: "all", projects: [], notifications: null,
    // Plan item 2.0: the page strip carries the expand control, as on every page.
    children: <><PageStrip title="Profile" /><div className="p-6"><Input label="Notes" placeholder="Type here" /></div></>,
  },
} satisfies Meta<typeof SidebarView>
export default meta
type Story = StoryObj<typeof meta>

async function expectWidth(handle: HTMLElement, sidebar: HTMLElement, width: number) {
  await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", String(width)))
  await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(width))
}

export const KeyboardAndRememberedWidth: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    await expect(handle).toHaveAttribute("aria-orientation", "vertical")
    await expect(handle).toHaveAttribute("aria-valuemin", "0")
    await expect(handle).toHaveAttribute("aria-valuemax", "400")
    await expectWidth(handle, sidebar, 272)
    await expect(canvas.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument()
    handle.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expectWidth(handle, sidebar, 288)
    await userEvent.keyboard("{Home}")
    await expectWidth(handle, sidebar, 0)
    await expect(sidebar).toHaveAttribute("inert")
    const expand = within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" })
    await expect(expand).toBeVisible()
    await userEvent.click(expand)
    await expectWidth(handle, sidebar, 288)
    await expect(sidebar).not.toHaveAttribute("inert")
    await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
    handle.focus()
    await userEvent.keyboard("{Enter}")
    await expectWidth(handle, sidebar, 0)
    handle.focus()
    await userEvent.keyboard("{Enter}")
    await expectWidth(handle, sidebar, 288)
  },
}

export const KeyboardLimits: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    for (const width of [256, 240, 224, 208, 200, 0]) {
      await userEvent.keyboard("{ArrowLeft}")
      await expectWidth(handle, sidebar, width)
    }
    handle.focus()
    await userEvent.keyboard("{End}")
    await expectWidth(handle, sidebar, 400)
    await userEvent.keyboard("{ArrowRight}")
    await expectWidth(handle, sidebar, 400)
  },
}

export const TypingKeepsLayout: Story = {
  args: { children: <><PageStrip title="Profile" /><div className="grid gap-4 p-6">
    <Input label="Notes" placeholder="Type here" />
    <Dialog><DialogTrigger asChild><Button variant="secondary">Open example dialog</Button></DialogTrigger>
      <DialogContent title="Example dialog" description="Check that a dialog keeps keyboard focus."><p>Sidebar shortcuts stay inactive here.</p></DialogContent>
    </Dialog>
  </div></> },
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    const input = canvas.getByRole("textbox", { name: "Notes" })
    await userEvent.type(input, "[BracketLeft]")
    await expect(input).toHaveValue("[")
    await expect(handle).toHaveAttribute("aria-valuenow", "272")
    const account = canvas.getByRole("button", { name: "Account menu, Alex Morgan" })
    await userEvent.click(account)
    await userEvent.keyboard("[BracketLeft]")
    await expect(handle).toHaveAttribute("aria-valuenow", "272")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument())
    await userEvent.click(canvas.getByRole("button", { name: "Open example dialog" }))
    const dialog = await within(document.body).findByRole("dialog", { name: "Example dialog" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard("[BracketLeft]")
    await expect(handle).toHaveAttribute("aria-valuenow", "272")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Example dialog" })).not.toBeInTheDocument())
  },
}

export const MobileDrawerUnchanged: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth > 640) return
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("separator", { name: "Resize sidebar" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
    const opener = canvas.getByRole("button", { name: "Open navigation" })
    await userEvent.click(opener)
    const dialog = await within(document.body).findByRole("dialog", { name: "Navigation" })
    await expect(within(dialog).getByRole("button", { name: "Close sidebar" })).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument())
    await expect(opener).toHaveFocus()
  },
}

export const LinearPreviewResponsiveCollapse: Story = {
  args: { linearPreviewAutoCollapse: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shell = canvasElement.querySelector<HTMLElement>("[data-workspace-shell]")!
    const sidebar = canvasElement.querySelector<HTMLElement>("#lane-sidebar")!
    const handle = canvasElement.querySelector<HTMLElement>('[role="separator"][aria-label="Resize sidebar"]')!

    if (innerWidth > 880) {
      await expectWidth(handle, sidebar, 254)
      await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
      await expect(handle).not.toHaveAttribute("aria-disabled")
      return
    }

    await waitFor(() => expect(sidebar).toHaveAttribute("data-collapsed"))
    await waitFor(() => expect(Math.round(sidebar.getBoundingClientRect().width)).toBe(0))
    await expect(handle).toHaveAttribute("aria-valuenow", "0")
    await expect(handle).toHaveAttribute("aria-disabled", "true")
    await expect(canvas.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument()
    await expect(getComputedStyle(shell).flexDirection).toBe("row")
    await expect(canvas.getByRole("main").getBoundingClientRect().width).toBeGreaterThan(innerWidth - 32)

    const expand = canvas.getByRole("button", { name: "Expand sidebar" })
    expand.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(sidebar).toHaveAttribute("data-peeking"))
    await expect(handle).toHaveAttribute("aria-valuenow", "0")
    await waitFor(() => expect(canvas.getByRole("button", { name: "Account menu, Alex Morgan" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-peeking"))
    await expect(expand).toHaveFocus()
    await userEvent.keyboard("[BracketLeft]")
    await waitFor(() => expect(sidebar).toHaveAttribute("data-peeking"))
    await expect(handle).toHaveAttribute("aria-valuenow", "0")
    await userEvent.keyboard("{Escape}")
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await expect(expand).toHaveFocus()
  },
}

function dragPointer(handle: HTMLElement, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture", x: number, pointerId = 17) {
  // Exercise React's real pointer handlers; capture is only needed by trusted
  // browser drags, since these deliberate test events remain on the handle.
  handle.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: 100 }))
}

export const PointerResizeAndCollapseThreshold: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 370)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "342"))
    dragPointer(handle, "pointerup", 370)
    await expectWidth(handle, sidebar, 342)
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 138)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "200"))
    dragPointer(handle, "pointerup", 138)
    await expectWidth(handle, sidebar, 200)
    dragPointer(handle, "pointerdown", 200)
    dragPointer(handle, "pointermove", 159)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "0"))
    dragPointer(handle, "pointerup", 159)
    await expectWidth(handle, sidebar, 0)
    dragPointer(handle, "pointerdown", 0)
    dragPointer(handle, "pointermove", 232)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "232"))
    dragPointer(handle, "pointerup", 232)
    await expectWidth(handle, sidebar, 232)
    await expect(sidebar).not.toHaveAttribute("inert")
  },
}

export const CancelledDragRestoresWidth: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 410)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "382"))
    dragPointer(handle, "pointercancel", 410)
    await expectWidth(handle, sidebar, 272)
    dragPointer(handle, "pointerdown", 300)
    dragPointer(handle, "pointermove", 150)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "0"))
    await userEvent.keyboard("{Escape}")
    await expectWidth(handle, sidebar, 272)
    handle.focus()
    await userEvent.keyboard("{Home}")
    await expectWidth(handle, sidebar, 0)
    await userEvent.click(within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" }))
    await expectWidth(handle, sidebar, 272)
  },
}

export const SearchCollapseFocus: Story = {
  args: { pathname: "/", children: <div className="p-6"><SidebarExpandButton />Original Requests content</div> },
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }))
    const search = await canvas.findByRole("searchbox", { name: "Search workspace" })
    await waitFor(() => expect(search).toHaveFocus())
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    await userEvent.keyboard("[BracketLeft]")
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "0"))
    const searchPane = canvas.getByRole("region", { name: "Workspace search" })
    const expand = within(searchPane).getByRole("button", { name: "Expand sidebar" })
    await waitFor(() => expect(expand).toHaveFocus())
    await expect(canvasElement.querySelectorAll('button[aria-label="Expand sidebar"]')).toHaveLength(2)
    await userEvent.keyboard("{Escape}")
    const requestsExpand = canvas.getByRole("button", { name: "Expand sidebar" })
    await waitFor(() => expect(requestsExpand).toHaveFocus())
    await expect(requestsExpand).not.toBe(expand)
  },
}

/** Samples a value once per frame until `done` holds or the time runs out. */
async function sampleFrames<T>(sample: () => T, ms: number) {
  const values: T[] = []
  const end = performance.now() + ms
  while (performance.now() < end) {
    values.push(sample())
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
  return values
}
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches
const panelOf = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>("[data-sidebar-panel]")!

/** Plan item 2.4: a collapse slides the panel on transform only and the content widens once, at the start. */
export const CollapseTranslatesPanel: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const main = canvas.getByRole("main")
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    await expectWidth(handle, sidebar, 272)
    const before = main.getBoundingClientRect().width
    let settledAt = 0
    handle.focus()
    const started = performance.now()
    await userEvent.keyboard("[BracketLeft]")
    const animations = panelOf(canvasElement).getAnimations()
    if (reducedMotion()) {
      await expect(animations).toHaveLength(0)
    } else {
      await expect(animations).toHaveLength(1)
      const keyframes = (animations[0].effect as KeyframeEffect).getKeyframes()
      for (const frame of keyframes) await expect(Object.keys(frame).filter(key => !["offset", "computedOffset", "easing", "composite"].includes(key))).toEqual(["transform"])
      void animations[0].finished.then(() => { settledAt = performance.now() })
    }
    const widths = await sampleFrames(() => Math.round(main.getBoundingClientRect().width), 320)
    // At most two widths: the one before the toggle, if a frame caught it, and the one after.
    await expect(new Set(widths).size).toBeLessThanOrEqual(2)
    await expect(widths.at(-1)).toBeGreaterThan(before)
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-motion"))
    await expect(panelOf(canvasElement).getAnimations()).toHaveLength(0)
    // The slide settles in its 180 ms (plus a frame of slack for the test's own clock, as for the expand).
    if (!reducedMotion()) {
      await expect(settledAt).toBeGreaterThan(0)
      await expect(settledAt - started).toBeLessThanOrEqual(180 + 50)
    }
  },
}

/** Plan item 2.4: an expand slides the panel in over the content, and the content narrows once, at the end. */
export const ExpandChangesWidthOnce: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const main = canvas.getByRole("main")
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    await userEvent.keyboard("{Home}")
    await expectWidth(handle, sidebar, 0)
    const collapsedWidth = Math.round(main.getBoundingClientRect().width)
    const expand = within(main).getByRole("button", { name: "Expand sidebar" })
    let settledAt = 0
    // From the keyboard: a pointer would open the peek first, and pinning a visible peek does not slide.
    expand.focus()
    const started = performance.now()
    await userEvent.keyboard("{Enter}")
    if (!reducedMotion()) {
      const [slide] = panelOf(canvasElement).getAnimations()
      await expect(slide).toBeDefined()
      void slide.finished.then(() => { settledAt = performance.now() })
    }
    const widths = await sampleFrames(() => Math.round(main.getBoundingClientRect().width), 360)
    await expect(new Set(widths).size).toBeLessThanOrEqual(2)
    await expect(widths[0]).toBe(collapsedWidth)
    await expect(widths.at(-1)).toBeLessThan(collapsedWidth)
    await expectWidth(handle, sidebar, 272)
    await expect(canvas.queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument()
    // The slide settles in its 240 ms (plus a frame of slack for the test's own clock).
    if (!reducedMotion()) await expect(settledAt - started).toBeLessThanOrEqual(240 + 50)
  },
}

/** Plan item 2.4: a second press on Expand sidebar while the panel slides in (a double-click) leaves that slide alone. */
export const DoubleExpandSlidesOnce: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640 || reducedMotion()) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    await userEvent.keyboard("{Home}")
    await expectWidth(handle, sidebar, 0)
    const expand = within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" })
    const panel = panelOf(canvasElement)
    // The WAAPI slide only: the panel's own CSS transitions (the peek's) also show up in getAnimations().
    const slides = () => panel.getAnimations().filter(animation => !(animation instanceof CSSTransition) && !(animation instanceof CSSAnimation))
    let settledAt = 0
    // Clicked without a hover, so no peek opens first; the strip keeps the button while the panel slides in.
    const started = performance.now()
    expand.click()
    const [slide] = slides()
    await expect(slides()).toHaveLength(1)
    void slide.finished.then(() => { settledAt = performance.now() })
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await expect(expand).toBeInTheDocument()
    const offset = () => new DOMMatrixReadOnly(getComputedStyle(panel).transform).m41
    const offsets = [offset()]
    expand.click()
    // One slide: the same animation keeps running, and the panel never jumps back towards its off-screen edge.
    await expect(slides()).toEqual([slide])
    offsets.push(...await sampleFrames(offset, 320))
    for (let index = 1; index < offsets.length; index++) await expect(offsets[index]).toBeGreaterThanOrEqual(offsets[index - 1])
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-motion"))
    await expectWidth(handle, sidebar, 272)
    await expect(settledAt - started).toBeLessThanOrEqual(240 + 50)
  },
}

/** Plan item 2.4: grabbing the edge mid-slide finishes the slide and drags from the width it was heading to. */
export const DragDuringSlideFinishesIt: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640 || reducedMotion()) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    await userEvent.keyboard("{Home}")
    await expectWidth(handle, sidebar, 0)
    within(canvas.getByRole("main")).getByRole("button", { name: "Expand sidebar" }).focus()
    await userEvent.keyboard("{Enter}")
    await expect(sidebar).toHaveAttribute("data-motion", "expanding")
    dragPointer(handle, "pointerdown", 300)
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-motion"))
    await expect(panelOf(canvasElement).getAnimations()).toHaveLength(0)
    await expectWidth(handle, sidebar, 272)
    dragPointer(handle, "pointermove", 312)
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "284"))
    dragPointer(handle, "pointerup", 312)
    await expectWidth(handle, sidebar, 284)
  },
}

/** Plan item 2.4: a toggle mid-slide turns the same slide around rather than restarting it. */
export const ToggleMidSlideReverses: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640 || reducedMotion()) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    handle.focus()
    await userEvent.keyboard("{Enter}")
    const [slide] = panelOf(canvasElement).getAnimations()
    await expect(sidebar).toHaveAttribute("data-motion", "collapsing")
    handle.focus()
    await userEvent.keyboard("{Enter}")
    await expect(sidebar).toHaveAttribute("data-motion", "expanding")
    // The same animation now runs backwards; no second slide starts from an edge.
    // (A reversed rate applies once the animation is ready, so it is read when it lands.)
    await expect(panelOf(canvasElement).getAnimations()).toEqual([slide])
    await waitFor(() => expect(slide.playbackRate).toBe(-1))
    await waitFor(() => expect(sidebar).not.toHaveAttribute("data-motion"))
    await expectWidth(handle, sidebar, 272)
  },
}

export const UnrelatedPointerCannotEndDrag: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 640) return
    const canvas = within(canvasElement)
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" })
    const handle = canvas.getByRole("separator", { name: "Resize sidebar" })
    dragPointer(handle, "pointerdown", 300)
    for (const [event, x, expected] of [
      ["pointerup", 340, 312], ["pointercancel", 360, 332], ["lostpointercapture", 380, 352],
    ] as const) {
      dragPointer(handle, event, x, 99)
      dragPointer(handle, "pointermove", x)
      await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", String(expected)))
    }
    dragPointer(handle, "pointerup", 380)
    await expectWidth(handle, sidebar, 352)
  },
}
