import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields"
import type { ExpectedImpactDraft } from "@/lib/request-impact"
import { expectedImpactDraftSchema } from "@/lib/request-impact"

function Editor({ initial }: { initial: ExpectedImpactDraft }) {
  const [value, setValue] = useState(initial)
  const [revision, setRevision] = useState(0)
  return <><MeasurementPlanFields key={revision} value={value} onChange={setValue} requestType="improvement" /><button onClick={() => { setValue(expectedImpactDraftSchema.parse(value)!); setRevision(revision + 1) }}>Reload saved values</button><output data-testid="saved-values">{JSON.stringify(value)}</output></>
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
    await expect(within(canvas.getByRole("region", { name: "Primary metric" })).getByLabelText("Current value", { exact: true })).toHaveValue(0)
    await expect(canvas.getByRole("combobox", { name: "Metric" })).toHaveTextContent("Revenue per visit")
    await expect(canvas.getByRole("combobox", { name: "Current value unit" })).toHaveTextContent("USD / visit")
    await expect(canvas.queryByRole("textbox", { name: "Unit" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("combobox", { name: "Guardrail metric" })).toHaveTextContent("Refund cost")
    await expect(canvas.getByRole("button", { name: "Measurement window" })).toHaveTextContent("45 days after release")
    await expect(JSON.parse(canvas.getByTestId("saved-values").textContent!)).toEqual(metric)
    await userEvent.clear(canvas.getByLabelText("Value"))
    await userEvent.type(canvas.getByLabelText("Value"), "4.5")
    await expect(JSON.parse(canvas.getByTestId("saved-values").textContent!)).toEqual({ ...metric, guardrail: { ...metric.guardrail, limit: 4.5 } })
  },
}
export const MissingBaseline: Story = {
  args: { initial: { ...metric, baseline: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(within(canvas.getByRole("region", { name: "Primary metric" })).getByLabelText("Current value", { exact: true })).toHaveValue(null)
    await expect(canvas.queryByText("All users")).not.toBeInTheDocument()
    await expect(canvas.queryByText("All platforms")).not.toBeInTheDocument()
  },
}

export const CompleteOlderEditor: Story = {
  args: { initial: metric },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await expect(canvas.getByRole("combobox", { name: "Audience" })).toHaveTextContent("Audience")
    await expect(canvas.getByRole("combobox", { name: "Platform" })).toHaveTextContent("Platform")
    await userEvent.click(canvas.getByRole("combobox", { name: "Audience" }))
    await userEvent.click(page.getByRole("option", { name: "Returning users" }))
    await userEvent.click(await canvas.findByRole("combobox", { name: "Platform" }))
    await userEvent.click(page.getByRole("option", { name: "Web" }))
    const guardrail = within(await canvas.findByRole("region", { name: "Guardrail 1" }))
    await expect(guardrail.queryByRole("spinbutton", { name: "Current value" })).not.toBeInTheDocument()
    await userEvent.clear(guardrail.getByRole("spinbutton", { name: "Value" }))
    await userEvent.type(guardrail.getByRole("spinbutton", { name: "Value" }), "2")
    await userEvent.click(canvas.getByRole("button", { name: "Add another guardrail" }))
    await expect(canvas.getByRole("region", { name: "Guardrail 2" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved values" }))
    await expect(canvas.getByRole("combobox", { name: "Audience" })).toHaveTextContent("Returning users")
    await expect(canvas.getByRole("combobox", { name: "Platform" })).toHaveTextContent("Web")
    await expect(within(canvas.getByRole("region", { name: "Guardrail 1" })).getByRole("spinbutton", { name: "Value" })).toHaveValue(2)
    await expect(canvas.getByRole("region", { name: "Guardrail 2" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Measurement window" }))
    await userEvent.click(page.getByRole("menuitem", { name: "Custom date range…" }))
    await waitFor(() => expect(page.getByRole("dialog", { name: "Measurement date range" })).toBeVisible())
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

export const EmptyOlderRequestUsesDropdowns: Story = {
  args: { initial: { kind: "metric", metric: "", unit: "", baseline: null, target: null, source: "", reviewAfterDays: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await expect(canvas.queryByRole("textbox", { name: "Metric name" })).not.toBeInTheDocument()
    await userEvent.click(await canvas.findByRole("combobox", { name: "Metric" }))
    await userEvent.click(page.getByRole("option", { name: "Conversion rate" }))
    await expect(await canvas.findByRole("combobox", { name: "Current value unit" })).toHaveTextContent("%")
    await expect(await canvas.findByRole("spinbutton", { name: "Current value" })).toHaveValue(null)
    await userEvent.click(await canvas.findByRole("combobox", { name: "Current value unit" }))
    await userEvent.click(page.getByRole("option", { name: "Count" }))
    await expect(await canvas.findByRole("combobox", { name: "Current value unit" })).toHaveTextContent("Count")
    await userEvent.click(await canvas.findByRole("combobox", { name: "Metric" }))
    await userEvent.type(await page.findByRole("textbox", { name: "Search metrics" }), "Completed checkouts")
    await userEvent.click(page.getByRole("option", { name: "Create metric: “Completed checkouts”" }))
    await expect(await canvas.findByRole("combobox", { name: "Metric" })).toHaveTextContent("Completed checkouts")
    const saved = JSON.parse(canvas.getByTestId("saved-values").textContent!)
    await expect(saved).toMatchObject({ metric: "Completed checkouts", baseline: null, target: null, reviewAfterDays: null })
    await expect(saved).not.toHaveProperty("measurement")
  },
}
