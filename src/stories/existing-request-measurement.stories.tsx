import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields"
import type { ExpectedImpactDraft } from "@/lib/request-impact"

function Editor({ initial }: { initial: ExpectedImpactDraft }) {
  const [value, setValue] = useState(initial)
  return <><MeasurementPlanFields value={value} onChange={setValue} requestType="improvement" /><output data-testid="saved-values">{JSON.stringify(value)}</output></>
}
const meta = { title: "Requests/Existing measurement", component: Editor } satisfies Meta<typeof Editor>
export default meta
type Story = StoryObj<typeof meta>
const metric = { kind: "metric" as const, metric: "Revenue per visit", baseline: 0, target: 12.5, unit: "USD / visit", source: "Saved analytics report", reviewAfterDays: 45,
  guardrail: { metric: "Refund cost", operator: "at_most" as const, limit: 3.5, unit: "USD" } }

export const ExistingMetric: Story = {
  args: { initial: metric },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("heading", { name: "Primary metric" })).toBeVisible()
    await expect(canvas.getByLabelText("Current value", { exact: true })).toHaveValue(0)
    await expect(canvas.getByLabelText("Unit", { exact: true })).toHaveValue("USD / visit")
    await expect(canvas.getByLabelText("Days after release")).toHaveValue(45)
    await expect(JSON.parse(canvas.getByTestId("saved-values").textContent!)).toEqual(metric)
    await userEvent.clear(canvas.getByLabelText("Limit value"))
    await userEvent.type(canvas.getByLabelText("Limit value"), "4.5")
    await expect(JSON.parse(canvas.getByTestId("saved-values").textContent!)).toEqual({ ...metric, guardrail: { ...metric.guardrail, limit: 4.5 } })
  },
}
export const MissingBaseline: Story = {
  args: { initial: { ...metric, baseline: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText("Current value", { exact: true })).toHaveValue(null)
    await expect(canvas.queryByText("All users")).not.toBeInTheDocument()
    await expect(canvas.queryByText("All platforms")).not.toBeInTheDocument()
  },
}
export const ExistingVerifiedResult: Story = {
  args: { initial: { kind: "verification", result: "A customer can recover their saved basket.", source: "Recorded customer session", reviewAfterDays: 21 } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("textbox", { name: "Verified result" })).toHaveValue("A customer can recover their saved basket.")
    await expect(canvas.getByLabelText("Evidence source")).toHaveValue("Recorded customer session")
    await expect(JSON.parse(canvas.getByTestId("saved-values").textContent!)).toEqual(args.initial)
  },
}
