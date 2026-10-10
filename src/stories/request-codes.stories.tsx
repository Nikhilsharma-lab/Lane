import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import type { OverviewRequest } from "@/lib/request-overview"
import requestsMeta from "./requests.stories"
import { LinearRequestsFixture } from "./helpers/linear-requests-fixture"

// Explicit illustrative saved numbers, deliberately different from display order.
const requests: OverviewRequest[] = [
  { id: "44444444-4444-4444-8444-444444444444", requestNumber: 42, title: "Alpha checkout problem", reframedProblem: null, status: "open", createdAt: "2026-10-08T10:00:00.000Z", creatorName: "Alex Morgan", assigneeName: null },
  { id: "77777777-7777-4777-8777-777777777777", requestNumber: 7, title: "Zulu invitation problem", reframedProblem: null, status: "open", createdAt: "2026-10-07T10:00:00.000Z", creatorName: "Alex Morgan", assigneeName: null },
  { id: "55555555-5555-4555-8555-555555555555", requestNumber: 105, title: "Maple upload problem", reframedProblem: null, status: "open", createdAt: "2026-10-06T10:00:00.000Z", creatorName: "Sam Lee", assigneeName: null },
]

const meta = {
  ...requestsMeta,
  title: "Patterns/Request codes",
  args: { ...requestsMeta.args, requests },
  afterEach: async ({ canvasElement }) => {
    // Let Arc finish its outgoing labels and incoming fades before measuring
    // settled colour contrast. Keep the real motion and accessibility checks.
    await waitFor(() => {
      expect(canvasElement.querySelector("[data-motion-pop-id]")).toBeNull()
      expect(canvasElement.getAnimations({ subtree: true }).filter(animation => animation.playState === "running")).toHaveLength(0)
    })
  },
} satisfies Meta<typeof requestsMeta.component>
export default meta
type Story = StoryObj<typeof meta>

export const SavedCodes: Story = {
  parameters: { fullShell: true },
  args: { context: { orgId: "org_storybook" } },
  render: args => <LinearRequestsFixture {...args} />,
  play: async ({ canvasElement }) => {
    const links = within(within(canvasElement).getByRole("list", { name: "Open Requests" })).getAllByRole("link")
    if (canvasElement.clientWidth > 880) {
      const titleStart = links[0].getBoundingClientRect().left
      for (const link of links) expect(link.getBoundingClientRect().left).toBe(titleStart)
    }
  },
}

export const CopyAndSearchInWorkspace: Story = {
  ...SavedCodes,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const clipboard = navigator.clipboard
    const writeText = fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
      // Phone-width compact rows hide the code to keep the title readable; the row menu still copies it.
      const codeOnRow = innerWidth > 640
      if (codeOnRow) {
        const code = canvas.getByRole("button", { name: "Copy code LAN-42" })
        code.focus()
        await userEvent.keyboard("{Enter}")
        await expect(await canvas.findByText("LAN-42 copied.")).toBeInTheDocument()
      } else {
        expect(canvas.queryByRole("button", { name: "Copy code LAN-42" })).not.toBeInTheDocument()
        await userEvent.pointer({ target: canvas.getByRole("link", { name: requests[0].title }), keys: "[MouseRight]" })
        await userEvent.click(within(await page.findByRole("menu", { name: "Request LAN-42" })).getByRole("menuitem", { name: "Copy" }))
        await userEvent.click(await page.findByRole("menuitem", { name: "Copy code" }))
        await expect(await canvas.findByText("Code copied.")).toBeInTheDocument()
        await waitFor(() => expect(page.queryAllByRole("menu")).toHaveLength(0))
      }
      await expect(writeText).toHaveBeenCalledWith("LAN-42")
      await userEvent.keyboard("/")
      const search = await canvas.findByRole("searchbox", { name: "Search workspace" })
      await userEvent.type(search, "lan-42{Enter}")
      const results = await canvas.findByRole("region", { name: "Requests results" })
      await waitFor(() => expect(results).toBeVisible())
      const result = within(results).getByRole("link", { name: /Alpha checkout problem/ })
      await expect(result).toHaveAttribute("href", `/requests/${requests[0].id}`)
      await expect(result).toHaveTextContent("LAN-42")
      await expect(within(results).getAllByRole("link")).toHaveLength(1)
      await userEvent.clear(search)
      await userEvent.type(search, "LAN-4{Enter}")
      await expect(await canvas.findByRole("heading", { name: "No results found" })).toBeVisible()
      await userEvent.click(canvas.getByRole("button", { name: "Close search" }))
      await waitFor(() => expect(page.queryByRole("searchbox", { name: "Search workspace" })).not.toBeInTheDocument())
      if (codeOnRow) await expect(canvas.getByRole("button", { name: "Copy code LAN-42" })).toBeVisible()
    } finally { Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard }) }
  },
}

export const StableThroughSortAndFilter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const list = within(canvas.getByRole("list", { name: "Open Requests" }))
    await expect(within(list.getAllByRole("listitem")[0]).getByRole("button", { name: "Copy code LAN-42" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Display" }))
    const display = within(await page.findByRole("dialog", { name: "Display Requests" }))
    await userEvent.click(display.getByRole("combobox", { name: "Order by" }))
    await userEvent.click(await page.findByRole("option", { name: "Title Z–A" }))
    await waitFor(() => expect(page.queryByRole("listbox")).not.toBeInTheDocument())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Display Requests" })).not.toBeInTheDocument())
    const sorted = list.getAllByRole("listitem")
    await expect(within(sorted[0]).getByRole("button", { name: "Copy code LAN-7" })).toBeVisible()
    await expect(within(sorted[0]).getByRole("link", { name: requests[1].title })).toHaveAttribute("href", `/requests/${requests[1].id}`)
    await expect(within(sorted[2]).getByRole("button", { name: "Copy code LAN-42" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Filter Requests by title" }))
    await userEvent.type(await page.findByRole("searchbox", { name: "Filter Requests by title" }), "Alpha")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(1))
    await expect(canvas.getByRole("button", { name: "Copy code LAN-42" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: requests[0].title })).toHaveAttribute("href", `/requests/${requests[0].id}`)
  },
}

export const KeyboardCopy: Story = {
  args: { requests: [requests[0]] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const clipboard = navigator.clipboard
    const writeText = fn().mockResolvedValue(undefined)
    const rowClick = fn()
    const button = canvas.getByRole("button", { name: "Copy code LAN-42" })
    document.addEventListener("click", rowClick)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
      button.focus()
      await userEvent.keyboard("{Enter}")
      await expect(await canvas.findByText("LAN-42 copied.")).toBeInTheDocument()
      await expect(button).toHaveFocus()
      await expect(writeText).toHaveBeenCalledTimes(1)
      await expect(writeText).toHaveBeenCalledWith("LAN-42")
      await expect(rowClick).not.toHaveBeenCalled()
      await expect(canvas.getByRole("checkbox", { name: `Select ${requests[0].title}` })).not.toBeChecked()
      // Measure the layout target; Arc's just-released press spring can still
      // make its visual bounding box fractionally smaller for a frame.
      await expect(button.offsetHeight).toBeGreaterThanOrEqual(44)
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    } finally {
      document.removeEventListener("click", rowClick)
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard })
    }
  },
}

export const CopyFailureAndRetry: Story = {
  args: { requests: [requests[0]] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const clipboard = navigator.clipboard
    const writeText = fn().mockRejectedValueOnce(new Error("Clipboard unavailable")).mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
      const button = canvas.getByRole("button", { name: "Copy code LAN-42" })
      await userEvent.click(button)
      await expect(await canvas.findByText("Copy failed. Try again.")).toBeVisible()
      await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
      await expect(button).toHaveFocus()
      await userEvent.keyboard(" ")
      await expect(await canvas.findByText("LAN-42 copied.")).toBeInTheDocument()
      await expect(canvas.queryByText("Copy failed. Try again.")).not.toBeInTheDocument()
      await expect(writeText).toHaveBeenCalledTimes(2)
      await expect(writeText).toHaveBeenLastCalledWith("LAN-42")
      await expect(button).toHaveFocus()
    } finally { Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard }) }
  },
}

export const PendingCopyDoesNotDuplicate: Story = {
  args: { requests: [requests[0]] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const clipboard = navigator.clipboard
    let finishCopy!: () => void
    const writeText = fn(() => new Promise<void>(resolve => { finishCopy = resolve }))
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
      const button = canvas.getByRole("button", { name: "Copy code LAN-42" })
      await userEvent.dblClick(button)
      await expect(writeText).toHaveBeenCalledTimes(1)
      await expect(button).toHaveAttribute("aria-busy", "true")
      await expect(button).toHaveFocus()
      finishCopy()
      await expect(await canvas.findByText("LAN-42 copied.")).toBeInTheDocument()
      await expect(button).not.toHaveAttribute("aria-disabled", "true")
    } finally { Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard }) }
  },
}

export const LongSavedCode: Story = {
  args: { requests: [{ ...requests[0], requestNumber: 2_147_483_647, title: "A longer Request title remains readable beside its saved code on a small screen" }] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Copy code LAN-2147483647" })).toBeVisible()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const PreviewMenuUsesSavedCode: Story = {
  parameters: { fullShell: true },
  args: { requests: [{ ...requestsMeta.args.requests[0], requestNumber: 42 }], context: { orgId: "org_storybook" } },
  render: args => <LinearRequestsFixture {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const clipboard = navigator.clipboard
    const writeText = fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    try {
      // Phone-width compact rows hide the code to keep the title readable; the menu still names and copies it.
      if (innerWidth > 640) await expect(canvas.getByRole("button", { name: "Copy code LAN-42" })).toBeVisible()
      else expect(canvas.queryByRole("button", { name: "Copy code LAN-42" })).not.toBeInTheDocument()
      await userEvent.pointer({ target: canvas.getByRole("link", { name: requestsMeta.args.requests[0].title }), keys: "[MouseRight]" })
      const menu = within(await page.findByRole("menu", { name: "Request LAN-42" }))
      await userEvent.click(menu.getByRole("menuitem", { name: "Copy" }))
      await userEvent.click(await page.findByRole("menuitem", { name: "Copy code" }))
      await expect(writeText).toHaveBeenCalledTimes(1)
      await expect(writeText).toHaveBeenCalledWith("LAN-42")
      await expect(await canvas.findByText("Code copied.")).toBeInTheDocument()
      await waitFor(() => expect(page.queryAllByRole("menu")).toHaveLength(0))
    } finally { Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard }) }
  },
}
