import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, within } from "storybook/test"
import { RequestRow } from "@/components/requests/request-row"
import { columns } from "@/components/requests/tasks/columns"
import type { OverviewRequest } from "@/lib/request-overview"
import styles from "@/components/requests/request-rows.module.css"

// Illustrative records only; this story does not read or write a workspace.
const request: OverviewRequest = {
  id: "density-short", title: "Checkout Request", reframedProblem: null,
  status: "open", createdAt: "2026-10-01T09:00:00.000Z", creatorName: "Alex Morgan",
  assigneeName: "Sam Lee", assignedTo: "member-sam", projectId: "project-website", projectName: "Website",
}
const longTitle = "Customers cannot find their delivery date before checkout and need a clear delivery estimate when reviewing an order with several items from different locations. ".repeat(3).trim()

const meta = {
  title: "Requests/Row density",
  component: RequestRow,
  parameters: { layout: "fullscreen" },
  args: { request, columns, visibility: { requestType: false, submittedBy: false }, filter: "all", projectFilter: "all", checked: false, disabled: false, onCheckedChange: fn() },
  render: args => <main className={styles.records} style={{ padding: "var(--space-4)" }}>
    <ul className={styles.list} aria-label="Request row density examples">
      <RequestRow {...args} />
      <RequestRow {...args} request={{ ...request, id: "density-long", title: longTitle }} />
    </ul>
  </main>,
} satisfies Meta<typeof RequestRow>
export default meta
type Story = StoryObj<typeof meta>

export const CompactWithWrapping: Story = {
  play: async ({ canvasElement }) => {
    await document.fonts.ready
    const canvas = within(canvasElement)
    const title = canvas.getByRole("link", { name: "Checkout Request" })
    const row = title.closest("li")!
    const long = canvas.getByRole("link", { name: longTitle })
    const narrow = canvasElement.clientWidth - 32 <= 880
    // Pills grow to 44px for coarse pointers only; a narrow window with a mouse keeps 32px (adc8178).
    const touch = matchMedia("(pointer: coarse)").matches
    if (!narrow) await expect(row.getBoundingClientRect().height).toBe(44)
    await expect(title.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    // Linear row radius (--lane-row-radius), the Storybook default since decision 8.12.
    await expect(getComputedStyle(row).borderRadius).toBe("8px")
    await expect(long.getBoundingClientRect().height).toBeGreaterThan(44)
    await expect(long.scrollWidth).toBeLessThanOrEqual(long.clientWidth + 1)
    for (const pill of within(row).getAllByRole("button")) {
      await expect(pill.getBoundingClientRect().height).toBeGreaterThanOrEqual(touch ? 44 : 32)
    }
    await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(document.documentElement.clientWidth)
  },
}
