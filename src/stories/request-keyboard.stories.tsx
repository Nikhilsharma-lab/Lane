import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { listProjects } from "@/app/(app)/intake/project-actions"
import { markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import { clearIntakeDraft, intakeDraftScope } from "@/lib/intake-draft"
import type { OverviewRequest } from "@/lib/request-overview"
import type { RequestPriority } from "@/lib/request-constants"
import { matchCountText } from "@/components/requests/request-row-label"
import { PendingMutationsProvider } from "@/components/requests/pending-mutations-provider"
import { LinearRequestsFixture } from "./helpers/linear-requests-fixture"
import { announcer, requestGroup, requestRow, requestRows } from "./helpers/request-grid"

// Illustrative fixture content only; never inserted into a Lane workspace. 32 Requests, so the list has two pages:
// page 1 holds 14 Open, 10 In Progress and 1 Done; page 2 the other 7 Done.
const statusOf = (index: number) => index < 14 ? "open" as const : index < 24 ? "in_progress" as const : "done" as const
const requests: OverviewRequest[] = Array.from({ length: 32 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  requestNumber: index + 1,
  title: `Keyboard fixture Request ${index + 1}`,
  reframedProblem: null,
  status: statusOf(index),
  canEdit: statusOf(index) === "open",
  // Newest first keeps this order inside each status group.
  createdAt: new Date(Date.UTC(2026, 9, 1, 9, 0, 0) - index * 60_000).toISOString(),
  creatorName: "Alex Morgan",
  assigneeName: statusOf(index) === "open" ? null : "Sam Lee",
  assignedTo: statusOf(index) === "open" ? null : "person-sam",
  projectId: null,
  projectName: null,
}))
const context = { orgId: "org_storybook" }

const meta = {
  title: "Patterns/Request keyboard",
  component: LinearRequestsFixture,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/", query: {} } } },
  args: { requests, isGuest: false, context },
  // As in the authenticated layout, the pending-mutation overlay shows each move in the next frame.
  render: args => <PendingMutationsProvider><LinearRequestsFixture {...args} /></PendingMutationsProvider>,
  beforeEach: () => {
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] })
    mocked(pickUpRequest).mockReset().mockResolvedValue({ success: true })
    mocked(markDone).mockReset().mockResolvedValue({ success: true })
    mocked(undoMarkDone).mockReset().mockResolvedValue({ success: true, status: "in_progress" })
    mocked(setRequestPriority).mockReset().mockImplementation(async (_id, priority) => ({ success: true as const, priority: priority as RequestPriority }))
    getRouter().push.mockClear()
    getRouter().refresh.mockClear()
    clearIntakeDraft(window.sessionStorage, intakeDraftScope("linear-preview-person", "org_storybook"))
  },
} satisfies Meta<typeof LinearRequestsFixture>
export default meta
type Story = StoryObj<typeof meta>

const grid = (canvasElement: HTMLElement) => within(canvasElement).getByRole("treegrid")
const tabStops = (canvasElement: HTMLElement) => canvasElement.querySelectorAll<HTMLElement>('[role="row"][tabindex="0"]')
const focusedKey = () => (document.activeElement as HTMLElement | null)?.dataset.gridRow
const header = (canvasElement: HTMLElement, group: string) => canvasElement.querySelector<HTMLElement>(`[role="row"][data-grid-row="g:status:${group}"]`)!
const idOf = (index: number) => requests[index].id
async function expectRing(element: HTMLElement) {
  await expect(element).toHaveFocus()
  await expect(getComputedStyle(element).outlineStyle).toBe("solid")
  // Arc's ring is 2px; the reduced-motion browser context reports it as 3px (so does the base's Deselected story).
  await expect(Number.parseFloat(getComputedStyle(element).outlineWidth)).toBeGreaterThanOrEqual(2)
}
async function openRowMenu(row: HTMLElement) {
  row.focus()
  await userEvent.keyboard("{Shift>}{F10}{/Shift}")
  return within(await within(document.body).findByRole("menu", { name: /^Request LAN-/ }))
}

/** Tab reaches the list in one stop: the row holding the roving tab stop. */
export const GridTabStop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(tabStops(canvasElement)).toHaveLength(1)
    canvas.getByRole("button", { name: "Open list summary" }).focus()
    await userEvent.tab()
    const stop = tabStops(canvasElement)[0]
    await expectRing(stop)
    await expect(stop).toHaveAttribute("aria-level", "1")
    await userEvent.tab()
    await expect(grid(canvasElement).contains(document.activeElement)).toBe(false)
    await userEvent.tab({ shift: true })
    await expect(stop).toHaveFocus()
    // Every control inside a row is out of the Tab order.
    for (const control of requestRows(canvasElement)[0].querySelectorAll("button, a, [role='checkbox']")) await expect(control).toHaveAttribute("tabindex", "-1")
  },
}

/** J/K and the arrows walk headers and rows, Home and End jump, and J/K cross pages. */
export const JKArrowsHomeEnd: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    header(canvasElement, "open").focus()
    await userEvent.keyboard("j")
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(0)}`))
    await expectRing(requestRow(canvasElement, idOf(0)))
    await userEvent.keyboard("{ArrowDown}")
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(1)}`))
    await userEvent.keyboard("k")
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(0)}`))
    await userEvent.keyboard("{ArrowUp}")
    await waitFor(() => expect(focusedKey()).toBe("g:status:open"))
    await expect(tabStops(canvasElement)).toHaveLength(1)
    // End is the last row on this page (the one Done Request on page 1); Home the first header.
    await userEvent.keyboard("{End}")
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(24)}`))
    await userEvent.keyboard("{Home}")
    await waitFor(() => expect(focusedKey()).toBe("g:status:open"))
    await userEvent.keyboard("{End}")
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(24)}`))
    // Past the last row, J goes to the next page's first row, its Done header, and says so.
    await userEvent.keyboard("j")
    await waitFor(() => expect(canvas.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page"))
    await waitFor(() => expect(focusedKey()).toBe("g:status:done"))
    await expectRing(header(canvasElement, "done"))
    await expect(announcer(canvasElement)).toHaveTextContent("Page 2 of 2.")
    await userEvent.keyboard("k")
    await waitFor(() => expect(canvas.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page"))
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(24)}`))
    await expect(getRouter().push).not.toHaveBeenCalled()
  },
}

/** Right and Left expand, collapse and move between a header and its rows; Enter toggles a header. */
export const GroupKeys: Story = {
  play: async ({ canvasElement }) => {
    const open = header(canvasElement, "open")
    open.focus()
    await userEvent.keyboard("{ArrowLeft}")
    await waitFor(() => expect(open).toHaveAttribute("aria-expanded", "false"))
    await expect(open).toHaveFocus()
    await expect(requestRow(canvasElement, idOf(0))).not.toBeVisible()
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => expect(open).toHaveAttribute("aria-expanded", "true"))
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(0)}`))
    await userEvent.keyboard("j{ArrowLeft}")
    await waitFor(() => expect(open).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(open).toHaveAttribute("aria-expanded", "false"))
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(open).toHaveAttribute("aria-expanded", "true"))
    // Collapsing the group that holds focus (here by its button) gives focus to the group's header.
    const row = requestRow(canvasElement, idOf(2))
    row.focus()
    await waitFor(() => expect(tabStops(canvasElement)[0]).toBe(row))
    within(open).getByRole("button", { name: "Collapse Open group" }).click()
    await waitFor(() => expect(open).toHaveFocus())
    await expect(tabStops(canvasElement)[0]).toBe(open)
  },
}

/** Enter on a row opens it through its title link. */
export const EnterOpens: Story = {
  play: async ({ canvasElement }) => {
    const row = requestRow(canvasElement, idOf(3))
    const link = row.querySelector<HTMLAnchorElement>("a[data-request-title]")!
    const click = fn((event: MouseEvent) => event.preventDefault())
    link.addEventListener("click", click)
    try {
      row.focus()
      await userEvent.keyboard("{Enter}")
      await expect(click).toHaveBeenCalledOnce()
      await expect(link).toHaveAttribute("href", `/requests/${idOf(3)}`)
    } finally { link.removeEventListener("click", click) }
  },
}

/** X selects the focused row, in step with its checkbox; Esc clears and leaves focus where it is; each change is announced once. */
export const SelectWithXAndEsc: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = requestRow(canvasElement, idOf(0)), second = requestRow(canvasElement, idOf(1))
    first.focus()
    await userEvent.keyboard("x")
    await expect(first).toHaveAttribute("aria-selected", "true")
    await expect(within(first).getByRole("checkbox")).toBeChecked()
    await expect(announcer(canvasElement)).toHaveTextContent("1 Request selected.")
    await userEvent.keyboard("jx")
    await expect(second).toHaveAttribute("aria-selected", "true")
    await expect(announcer(canvasElement)).toHaveTextContent("2 Requests selected.")
    await expect(within(canvas.getByRole("toolbar", { name: "Selected Requests" })).getByText("2 selected")).toBeVisible()
    await userEvent.click(within(first).getByRole("checkbox"))
    await expect(first).toHaveAttribute("aria-selected", "false")
    // The selection started on the first row; the person is now on the second.
    await userEvent.keyboard("j")
    await waitFor(() => expect(second).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await expect(second).toHaveAttribute("aria-selected", "false")
    await expect(within(second).getByRole("checkbox")).not.toBeChecked()
    await expect(announcer(canvasElement)).toHaveTextContent("Selection cleared.")
    // Esc leaves focus, and the tab stop, on the row the person is on.
    await expect(second).toHaveFocus()
    await expect(tabStops(canvasElement)[0]).toBe(second)
  },
}

/** A view change from the keyboard drops the selection out loud: J past the page edge says so with the page, a collapse on its own. */
export const SelectionClearedByViewChange: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = () => canvas.queryByRole("toolbar", { name: "Selected Requests" })
    const last = requestRow(canvasElement, idOf(24))
    last.focus()
    await userEvent.keyboard("x")
    await expect(last).toHaveAttribute("aria-selected", "true")
    await expect(bar()).toBeInTheDocument()
    await userEvent.keyboard("j")
    await waitFor(() => expect(canvas.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page"))
    await waitFor(() => expect(focusedKey()).toBe("g:status:done"))
    await expect(bar()).not.toBeInTheDocument()
    await expect(announcer(canvasElement)).toHaveTextContent("Page 2 of 2. Selection cleared.")
    // Without a selection, crossing back says only the page.
    await userEvent.keyboard("k")
    await waitFor(() => expect(focusedKey()).toBe(`r:${idOf(24)}`))
    await expect(announcer(canvasElement)).toHaveTextContent(/^Page 1 of 2\.$/)
    // Left goes to the row's group header, a second Left collapses it.
    await userEvent.keyboard("x")
    await expect(bar()).toBeInTheDocument()
    await userEvent.keyboard("{ArrowLeft}")
    await waitFor(() => expect(focusedKey()).toBe("g:status:done"))
    await expect(bar()).toBeInTheDocument()
    await userEvent.keyboard("{ArrowLeft}")
    await waitFor(() => expect(header(canvasElement, "done")).toHaveAttribute("aria-expanded", "false"))
    await expect(bar()).not.toBeInTheDocument()
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent("Selection cleared."))
    await expect(header(canvasElement, "done")).toHaveFocus()
  },
}

/** F opens Add filter with its first field focused; Esc returns to the trigger. */
export const FOpensFilter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    requestRow(canvasElement, idOf(0)).focus()
    await userEvent.keyboard("f")
    const panel = await within(document.body).findByRole("dialog", { name: "Add filter" })
    await waitFor(() => expect(within(panel).getByRole("menuitem", { name: "Status" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Add filter" })).not.toBeInTheDocument())
    await expect(canvas.getByRole("button", { name: "Add filter" })).toHaveFocus()
  },
}

/** ? lists the shortcuts and toggles; Esc returns focus to the row; ? in a field is just a character. */
export const ShortcutOverlay: Story = {
  play: async ({ canvasElement }) => {
    const page = within(document.body)
    const row = requestRow(canvasElement, idOf(0))
    row.focus()
    await userEvent.keyboard("?")
    const overlay = await page.findByRole("dialog", { name: "Keyboard shortcuts" })
    // The dialog fades in (and only fades under reduced motion), so its text is visible once it has settled.
    await waitFor(() => expect(overlay).toHaveStyle({ opacity: "1" }))
    for (const name of ["Anywhere", "Requests list", "Request detail", "Forms"]) await expect(within(overlay).getByRole("heading", { name, level: 3 })).toBeVisible()
    for (const label of ["New Request", "Next row", "Select or deselect the Request", "Add a filter", "Next Request", "Previous Request", "Close a form or menu, then back to Requests", "Submit"]) await expect(within(overlay).getByText(label)).toBeVisible()
    await userEvent.keyboard("?")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument())
    await waitFor(() => expect(row).toHaveFocus())
    await userEvent.keyboard("?")
    await page.findByRole("dialog", { name: "Keyboard shortcuts" })
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument())
    await waitFor(() => expect(row).toHaveFocus())
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Filter Requests by title" }))
    const search = await page.findByRole("searchbox", { name: "Filter Requests by title" })
    await userEvent.type(search, "?")
    await expect(search).toHaveValue("?")
    await expect(page.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument()
  },
}

/** Typed in a field, the list's letters are letters. */
export const NoClashInFields: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(canvas.getByRole("button", { name: "Filter Requests by title" }))
    const search = await page.findByRole("searchbox", { name: "Filter Requests by title" })
    await userEvent.type(search, "jkxf?")
    await expect(search).toHaveValue("jkxf?")
    await expect(search).toHaveFocus()
    await expect(canvas.queryByRole("toolbar", { name: "Selected Requests" })).not.toBeInTheDocument()
    await expect(page.queryByRole("dialog", { name: "Add filter" })).not.toBeInTheDocument()
    await expect(page.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
  },
}

/** The row menu shows hints only for the two keys it can stand in for. */
export const RowMenuHints: Story = {
  play: async ({ canvasElement }) => {
    const menu = await openRowMenu(requestRow(canvasElement, idOf(0)))
    const hinted = menu.getAllByRole("menuitem").filter(item => item.querySelector("kbd")).map(item => [item.textContent?.replace(item.querySelector("kbd")!.textContent ?? "", ""), item.querySelector("kbd")!.textContent])
    await expect(hinted).toEqual([["Select", "X"], ["Open Request", "Enter"]])
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(within(document.body).queryAllByRole("menu")).toHaveLength(0))
  },
}

/** The list has one polite live region, also with a selection, filter chips and the summary open. */
export const OneLiveRegion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const workspace = canvasElement.querySelector<HTMLElement>('[data-slot="requests-workspace"]')!
    const regions = () => workspace.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="log"]')
    await expect(regions()).toHaveLength(1)
    await expect(regions()[0]).toBe(announcer(canvasElement))
    requestRow(canvasElement, idOf(0)).focus()
    await userEvent.keyboard("x")
    await userEvent.click(canvas.getByRole("button", { name: "Filter Requests by title" }))
    await userEvent.type(await within(document.body).findByRole("searchbox", { name: "Filter Requests by title" }), "fixture")
    await userEvent.keyboard("{Escape}")
    await userEvent.click(canvas.getByRole("button", { name: "Open list summary" }))
    await expect(canvas.getByRole("region", { name: "List summary" })).toBeVisible()
    await expect(regions()).toHaveLength(1)
  },
}

/** The result count is announced once the person stops typing, not on every keystroke. */
export const AnnouncedCountDebounced: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Filter Requests by title" }))
    const search = await within(document.body).findByRole("searchbox", { name: "Filter Requests by title" })
    const before = announcer(canvasElement).textContent
    await userEvent.type(search, "Request 1")
    const typed = performance.now()
    // 11 match: 1, 10 to 19.
    const expected = `${matchCountText(11)}.`
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 200 - (performance.now() - typed))))
    await expect(announcer(canvasElement).textContent).toBe(before)
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent(expected), { timeout: 1000 })
    await expect(canvas.getByText(matchCountText(11))).toBeVisible()
    await userEvent.keyboard("{Escape}")
  },
}

/** A pick up from the row menu is announced while the action is still pending. */
export const OptimisticAnnouncements: Story = {
  play: async ({ canvasElement }) => {
    let finish!: (result: { success: boolean }) => void
    mocked(pickUpRequest).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const menu = await openRowMenu(requestRow(canvasElement, idOf(0)))
    await userEvent.click(menu.getByRole("menuitem", { name: "Pick up" }))
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent("Picked up. The Request is now In Progress."))
    await expect(mocked(pickUpRequest)).toHaveBeenCalledOnce()
    // The move shows before the server answers.
    await expect(requestGroup(canvasElement, "In Progress Requests").querySelector(`[data-request-id="${idOf(0)}"]`)).not.toBeNull()
    finish({ success: true })
    await waitFor(() => expect(requestRow(canvasElement, idOf(0))).toHaveFocus())
  },
}

/** The acknowledgement contract for Mark Done from the keyboard: the move and its Undo show before the server answers. */
export const MarkDoneAcknowledged: Story = {
  play: async ({ canvasElement }) => {
    const page = within(document.body)
    let finish!: (result: { success: boolean }) => void
    mocked(markDone).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const id = idOf(14)
    const menu = await openRowMenu(requestRow(canvasElement, id))
    // The menu opens on its lead item, the one lifecycle move.
    await waitFor(() => expect(menu.getByRole("menuitem", { name: "Mark Done" })).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(requestRow(canvasElement, id).querySelector('button[data-status="done"]')).not.toBeNull())
    // The toast fades in under reduced motion; it is in the page, with Undo, before the server answers.
    await waitFor(() => expect(page.getByText("Marked Done")).toBeVisible())
    await waitFor(() => expect(page.getByRole("button", { name: "Undo" })).toBeVisible())
    // Pending, the row is Done, so its menu offers no second Mark Done to send.
    const again = await openRowMenu(requestRow(canvasElement, id))
    await expect(again.queryByRole("menuitem", { name: "Mark Done" })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await expect(mocked(markDone)).toHaveBeenCalledOnce()
    finish({ success: true })
    // Undo from the keyboard: Alt+T reaches the toast, Enter runs its action.
    await userEvent.keyboard("{Alt>}t{/Alt}")
    await waitFor(() => expect(page.getByRole("button", { name: "Undo" })).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(mocked(undoMarkDone)).toHaveBeenCalledWith(id, context))
    await waitFor(() => expect(requestRow(canvasElement, id).querySelector('button[data-status="in_progress"]')).not.toBeNull())
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  },
}

/** A refused Mark Done puts the row back and says why in a toast. */
export const MarkDoneRefusalReverts: Story = {
  play: async ({ canvasElement }) => {
    const page = within(document.body)
    let finish!: (result: { error: string }) => void
    mocked(markDone).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const id = idOf(15)
    const menu = await openRowMenu(requestRow(canvasElement, id))
    await userEvent.click(menu.getByRole("menuitem", { name: "Mark Done" }))
    await waitFor(() => expect(requestRow(canvasElement, id).querySelector('button[data-status="done"]')).not.toBeNull())
    finish({ error: "This Request changed before Lane could mark it Done." })
    await expect(await page.findByText("Could not update this Request")).toBeVisible()
    await waitFor(() => expect(requestRow(canvasElement, id).querySelector('button[data-status="in_progress"]')).not.toBeNull())
  },
}

/** A row that leaves a filtered view hands focus to the row that took its place, and says where it went. */
export const FocusAfterMarkDoneInFilteredView: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/", query: { status: "in_progress" } } } },
  play: async ({ canvasElement }) => {
    const id = idOf(15), next = idOf(16)
    const menu = await openRowMenu(requestRow(canvasElement, id))
    await userEvent.click(menu.getByRole("menuitem", { name: "Mark Done" }))
    await waitFor(() => expect(requestRow(canvasElement, id)).toBeNull())
    await waitFor(() => expect(requestRow(canvasElement, next)).toHaveFocus())
    await expect(announcer(canvasElement)).toHaveTextContent("LAN-16 left this view.")
  },
}

/** Copying a code swaps its label and glyph without a blur filter anywhere in the row or its tooltip. */
export const CopyCodeNoBlur: Story = {
  play: async ({ canvasElement }) => {
    // Phone-width rows hide the code; the menu's Copy code covers them.
    if (innerWidth <= 640) return
    const clipboard = navigator.clipboard
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: fn().mockResolvedValue(undefined) } })
    try {
      const row = requestRow(canvasElement, idOf(0))
      const button = within(row).getByRole("button", { name: "Copy code LAN-1" })
      button.focus()
      await userEvent.keyboard("{Enter}")
      const blurred: string[] = []
      const end = performance.now() + 500
      while (performance.now() < end) {
        for (const element of [...row.querySelectorAll("*"), ...document.querySelectorAll("[data-radix-popper-content-wrapper] *")]) {
          // A settled Arc Badge glyph keeps a static blur(0px); a morph passes through a real radius.
          const filter = getComputedStyle(element).filter
          if (/blur\((?!0px\))/.test(filter)) blurred.push(`${element.tagName.toLowerCase()} ${filter}`)
        }
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
      await expect(announcer(canvasElement)).toHaveTextContent("LAN-1 copied.")
      await expect(blurred).toEqual([])
    } finally { Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard }) }
  },
}
