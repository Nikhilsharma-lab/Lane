import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { RequestCurrentValues } from "@/app/(app)/requests/[id]/current-values"
import { saveRequestCurrentValues } from "@/app/(app)/requests/[id]/actions"
import { LifecycleButtons } from "@/app/(app)/requests/[id]/lifecycle-buttons"
import type { MeasurementPlan } from "@/lib/request-measurement"

const impact: MeasurementPlan = {
  kind: "measurement" as const, version: 2 as const,
  primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: null, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all" as const, platform: "all" as const, windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [{ key: "support" as const, name: "", unit: "count" as const, current: null, noBaseline: false as const, operator: "at_most" as const, limit: 20 }],
}

const meta = {
  title: "Requests/Current values",
  component: RequestCurrentValues,
  parameters: { layout: "padded", nextjs: { appDirectory: true } },
  args: { requestId: "measurement-request", context: { orgId: "measurement-workspace" }, impact, requestType: "improvement" },
  beforeEach: () => { mocked(saveRequestCurrentValues).mockReset().mockResolvedValue({ success: true, impact: { ...impact, primary: { ...impact.primary, current: 0 }, guardrails: [{ ...impact.guardrails[0], current: 0 }] } }) },
} satisfies Meta<typeof RequestCurrentValues>
export default meta
type Story = StoryObj<typeof meta>

export const MissingCurrentValues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("spinbutton", { name: "Conversion rate current value" })).toHaveValue(null)
    await expect(canvas.getByRole("spinbutton", { name: "Users who contacted support current value" })).toHaveValue(null)
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument()
    await expect(canvas.queryByRole("spinbutton", { name: /target|limit/i })).not.toBeInTheDocument()
  },
}

export const SavesZero: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Conversion rate current value" }), "0")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Users who contacted support current value" }), "0")
    await userEvent.click(canvas.getByRole("button", { name: "Save current values" }))
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Current values saved"))
    await expect(saveRequestCurrentValues).toHaveBeenLastCalledWith("measurement-request", { expectedImpact: impact, primary: 0, guardrails: [0] }, { orgId: "measurement-workspace" })
  },
}

export const NetworkFailureKeepsValues: Story = {
  beforeEach: () => { mocked(saveRequestCurrentValues).mockRejectedValueOnce(new Error("Offline fixture")) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const primary = canvas.getByRole("spinbutton", { name: "Conversion rate current value" })
    await userEvent.type(primary, "35")
    await userEvent.click(canvas.getByRole("button", { name: "Save current values" }))
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Your values are still here"))
    await expect(primary).toHaveValue(35)
    await expect(canvas.getByRole("button", { name: "Save current values" })).toBeEnabled()
  },
}

export const PickupNeedsCurrentValues: Story = {
  render: () => <LifecycleButtons requestId="measurement-request" status="open" context={{ orgId: "measurement-workspace" }} pickupBlockedReason="Add the current value before picking up this Request." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("button", { name: "Pick up" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Pick up" })).toHaveAccessibleDescription("Add the current value before picking up this Request.")
    canvas.getByRole("group", { name: "Pickup unavailable" }).focus()
    await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("Add the current value before picking up this Request.")
    await userEvent.keyboard("{Escape}")
  },
}

export const PickupNeedsRequesterValues: Story = {
  render: () => <LifecycleButtons requestId="measurement-request" status="open" context={{ orgId: "measurement-workspace" }} pickupBlockedReason="Add the current value before picking up this Request." pickupRequester="Alex Morgan" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("button", { name: "Pick up" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Pick up" })).toHaveAccessibleDescription("Ask Alex Morgan to add current values before pickup.")
    canvas.getByRole("group", { name: "Pickup unavailable" }).focus()
    await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("Ask Alex Morgan to add current values before pickup.")
    await userEvent.keyboard("{Escape}")
    await expect(canvas.queryByText("Add the current value before picking up this Request.")).not.toBeInTheDocument()
  },
}
