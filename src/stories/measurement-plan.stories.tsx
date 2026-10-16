import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields"
import { createEmptyMeasurementPlan, createMeasurementGuardrail, MAX_MEASUREMENT_GUARDRAILS } from "@/lib/request-measurement"

function Fixture({ initialGuardrails = 0 }: { initialGuardrails?: number }) {
  const [value, setValue] = useState(() => ({ ...createEmptyMeasurementPlan(), guardrails: Array.from({ length: initialGuardrails }, () => createMeasurementGuardrail()) }))
  return <div style={{ maxWidth: "calc(var(--sb-spacing) * 192)", padding: "var(--space-6)", margin: "auto" }}>
    <form onSubmit={event => event.preventDefault()}><MeasurementPlanFields value={value} onChange={setValue} requestType="new_feature" /></form>
  </div>
}

const meta = { title: "Intake/Measurement plan", component: Fixture, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Fixture>
export default meta
type Story = StoryObj<typeof meta>

async function choose(canvasElement: HTMLElement, label: string, option: string) {
  const canvas = within(canvasElement)
  const trigger = canvas.getByRole(label === "Measurement window" ? "button" : "combobox", { name: label })
  await userEvent.click(trigger)
  await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole(label === "Measurement window" ? "menuitem" : "option", { name: option }))
  await waitFor(() => expect(trigger).toHaveFocus())
}

// Catches the wiring bug where a changed metric unit silently reuses the previous numbers.
export const ChangeUnitsClearsIncompatibleValues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choose(canvasElement, "Metric", "Conversion rate")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "42")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Target after release (optional)" }), "65")
    await choose(canvasElement, "Current value unit", "Count")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(null)
    await expect(canvas.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(null)
    await expect(canvas.getByRole("combobox", { name: "Metric" })).toHaveTextContent("Conversions")
  },
}

export const Blank: Story = {}

// Catches loss of entered time measurements when switching their display unit.
export const TimeUnitConversion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choose(canvasElement, "Metric", "Median time to convert")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "120")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Target after release (optional)" }), "90")
    await choose(canvasElement, "Current value unit", "Minutes")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(2)
    await expect(canvas.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(1.5)
  },
}

async function openCustomDates(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Measurement window" }))
  const page = within(canvasElement.ownerDocument.body)
  await userEvent.click(await page.findByRole("menuitem", { name: "Custom dates…" }))
  return within(await page.findByRole("dialog", { name: "Custom measurement dates" }))
}

// Custom dates are staged in a calendar modal; invalid/cancelled edits never commit.
export const ExactDatesAndValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Measurement window" })
    await expect(trigger).toHaveTextContent("Measurement dates")
    let modal = await openCustomDates(canvasElement)
    await userEvent.type(modal.getByLabelText("From"), "2026-10-20")
    await userEvent.type(modal.getByLabelText("To"), "2026-10-19")
    await expect(modal.getByRole("button", { name: "Apply dates" })).toBeDisabled()
    await userEvent.clear(modal.getByLabelText("To"))
    await userEvent.type(modal.getByLabelText("To"), "2026-10-25")
    await userEvent.click(modal.getByRole("button", { name: "Apply dates" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveTextContent("20 Oct")
    await expect(trigger).toHaveTextContent("25 Oct")
    modal = await openCustomDates(canvasElement)
    await expect(modal.getByLabelText("From")).toHaveValue("2026-10-20")
    await userEvent.clear(modal.getByLabelText("To"))
    await userEvent.type(modal.getByLabelText("To"), "2026-10-30")
    await userEvent.click(modal.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveTextContent("25 Oct")
    await expect(trigger).not.toHaveTextContent("30 Oct")
    await choose(canvasElement, "Measurement window", "7 days after release")
    await expect(trigger).toHaveTextContent("7 days after release")
  },
}

// Removing one guardrail must not delete or transfer the next guardrail's measurements.
export const MultipleGuardrails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Add guardrail" }))
    let first = canvas.getByRole("region", { name: "Guardrail 1" })
    await waitFor(() => expect(within(first).getByRole("combobox", { name: "Guardrail metric" })).toHaveFocus())
    await expect(within(first).queryByRole("spinbutton", { name: "Current value" })).not.toBeInTheDocument()
    await expect(within(first).queryByRole("spinbutton", { name: "Limit value" })).not.toBeInTheDocument()
    await choose(first, "Guardrail metric", "Support contact rate")
    await userEvent.type(within(first).getByRole("spinbutton", { name: "Limit value" }), "10")
    await userEvent.click(canvas.getByRole("button", { name: "Add another guardrail" }))
    const second = canvas.getByRole("region", { name: "Guardrail 2" })
    await choose(second, "Guardrail metric", "Customer satisfaction (CSAT)")
    await userEvent.type(within(second).getByRole("spinbutton", { name: "Current value" }), "85")
    await userEvent.type(within(second).getByRole("spinbutton", { name: "Limit value" }), "80")
    await userEvent.click(within(first).getByRole("button", { name: "Remove guardrail 1" }))
    first = canvas.getByRole("region", { name: "Guardrail 1" })
    await expect(within(first).getByRole("combobox", { name: "Guardrail metric" })).toHaveTextContent("Customer satisfaction (CSAT)")
    await expect(within(first).getByRole("spinbutton", { name: "Current value" })).toHaveValue(85)
    await expect(within(first).getByRole("spinbutton", { name: "Limit value" })).toHaveValue(80)
    await expect(canvas.getByRole("button", { name: "Add another guardrail" })).toHaveFocus()
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

// Equal blank metrics still need distinct inputs: native incomplete numbers live
// in the input and must never transfer from a deleted guardrail to its neighbor.
export const SameMetricGuardrailKeepsFieldIdentity: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Add guardrail" }))
    await choose(canvas.getByRole("region", { name: "Guardrail 1" }), "Guardrail metric", "Support contact rate")
    await userEvent.click(canvas.getByRole("button", { name: "Add another guardrail" }))
    const second = canvas.getByRole("region", { name: "Guardrail 2" })
    await choose(second, "Guardrail metric", "Support contact rate")
    const secondCurrent = within(second).getByRole("spinbutton", { name: "Current value" })
    await userEvent.click(canvas.getByRole("button", { name: "Remove guardrail 1" }))
    const remaining = canvas.getByRole("region", { name: "Guardrail 1" })
    await expect(within(remaining).getByRole("spinbutton", { name: "Current value" })).toBe(secondCurrent)
    await expect(canvas.getByRole("button", { name: "Add another guardrail" })).toHaveFocus()
  },
}

// A custom metric cannot accept an untyped value; its chosen unit controls numeric validation.
export const CustomMetric: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choose(canvasElement, "Metric", "Add custom metric…")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toBeDisabled()
    await userEvent.type(canvas.getByRole("textbox", { name: "Metric name" }), "Qualified leads")
    await choose(canvasElement, "Unit", "Count")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "4.5")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveAttribute("aria-invalid", "true")
    await userEvent.clear(canvas.getByRole("spinbutton", { name: "Current value" }))
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "0")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(0)
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).not.toHaveAttribute("aria-invalid", "true")
  },
}

// Scope edits must preserve what the requester has already entered.
export const ScopeChangePreservesCurrentValues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choose(canvasElement, "Metric", "Conversion rate")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "42")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Target after release (optional)" }), "65")
    await choose(canvasElement, "Audience", "New users")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(42)
    await choose(canvasElement, "Platform", "iOS")
    await choose(canvasElement, "Measurement window", "7 days after release")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(42)
    await expect(canvas.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(65)
  },
}

// The new-feature exception applies to its primary metric, never to an existing guardrail.
export const NewFeatureException: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choose(canvasElement, "Metric", "Conversion rate")
    await userEvent.click(canvas.getByRole("checkbox", { name: "No existing data. This is a brand-new feature." }))
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Add guardrail" }))
    const guardrail = canvas.getByRole("region", { name: "Guardrail 1" })
    await choose(guardrail, "Guardrail metric", "Support contact rate")
    await expect(within(guardrail).getByRole("spinbutton", { name: "Current value" })).toBeEnabled()
    await userEvent.type(within(guardrail).getByRole("spinbutton", { name: "Current value" }), "8")
    await userEvent.click(canvas.getByRole("checkbox", { name: "No existing data. This is a brand-new feature." }))
    await expect(within(canvas.getByRole("region", { name: "Primary metric" })).getByRole("spinbutton", { name: "Current value" })).toBeEnabled()
    await expect(within(guardrail).getByRole("spinbutton", { name: "Current value" })).toHaveValue(8)
  },
}

// Keyboard selection opens the approved fixed test case instead of a freeform success claim.
export const KeyboardPassFail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const metric = canvas.getByRole("combobox", { name: "Metric" })
    metric.focus()
    await userEvent.keyboard("{Enter}{End}{Enter}")
    await waitFor(() => expect(metric).toHaveFocus())
    await expect(metric).toHaveTextContent("Pass/fail check")
    const check = canvas.getByRole("combobox", { name: "Test case" })
    check.focus()
    await userEvent.keyboard("{Enter}{Home}{Enter}")
    await waitFor(() => expect(check).toHaveFocus())
    await expect(check).toHaveTextContent("Keyboard navigation")
    await expect(canvas.getByRole("heading", { name: "Pass criterion" })).toBeVisible()
    await expect(canvas.queryByRole("spinbutton", { name: "Current value" })).not.toBeInTheDocument()
  },
}

// Changing dates must preserve user-entered numbers too, including after reopening.
export const ExactDatesPreserveCurrentValues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choose(canvasElement, "Metric", "Conversion rate")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "42")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Target after release (optional)" }), "65")
    let modal = await openCustomDates(canvasElement)
    await userEvent.type(modal.getByLabelText("From"), "2026-10-01")
    await userEvent.type(modal.getByLabelText("To"), "2026-10-07")
    await userEvent.click(modal.getByRole("button", { name: "Apply dates" }))
    await waitFor(() => expect(canvas.getByRole("button", { name: "Measurement window" })).toHaveFocus())
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(42)
    await userEvent.clear(canvas.getByRole("spinbutton", { name: "Current value" }))
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "39")
    modal = await openCustomDates(canvasElement)
    await userEvent.clear(modal.getByLabelText("To"))
    await userEvent.type(modal.getByLabelText("To"), "2026-10-14")
    await userEvent.click(modal.getByRole("button", { name: "Apply dates" }))
    await waitFor(() => expect(canvas.getByRole("button", { name: "Measurement window" })).toHaveFocus())
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(39)
    await expect(canvas.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(65)
  },
}

// Custom scope names and entered measurements survive switching presets.
export const CustomAudienceAndPlatform: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await choose(canvasElement, "Metric", "Feature adoption rate")
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "28")
    await choose(canvasElement, "Audience", "Add custom audience…")
    await userEvent.type(canvas.getByRole("textbox", { name: "Custom audience" }), "Paid customers")
    await choose(canvasElement, "Platform", "Add custom platform…")
    await userEvent.type(canvas.getByRole("textbox", { name: "Custom platform" }), "Desktop app")
    await choose(canvasElement, "Audience", "All users")
    await choose(canvasElement, "Platform", "Web")
    await choose(canvasElement, "Audience", "Add custom audience…")
    await choose(canvasElement, "Platform", "Add custom platform…")
    await expect(canvas.getByRole("textbox", { name: "Custom audience" })).toHaveValue("Paid customers")
    await expect(canvas.getByRole("textbox", { name: "Custom platform" })).toHaveValue("Desktop app")
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(28)
    await expect(canvas.queryByText(/Measurement changed/)).not.toBeInTheDocument()
  },
}

// Changing audience must not silently delete a guardrail baseline either.
export const GuardrailValuesSurviveScopeChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Add guardrail" }))
    const guardrail = canvas.getByRole("region", { name: "Guardrail 1" })
    await choose(guardrail, "Guardrail metric", "Support contact rate")
    await userEvent.type(within(guardrail).getByRole("spinbutton", { name: "Current value" }), "4")
    await userEvent.type(within(guardrail).getByRole("spinbutton", { name: "Limit value" }), "6")
    await choose(canvasElement, "Audience", "Returning users")
    await choose(canvasElement, "Platform", "Android")
    await expect(within(guardrail).getByRole("spinbutton", { name: "Current value" })).toHaveValue(4)
    await expect(within(guardrail).getByRole("spinbutton", { name: "Limit value" })).toHaveValue(6)
  },
}

// Numeric inputs follow the selected metric and stay inside the same card.
export const ProgressiveMetricFields: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("spinbutton", { name: "Current value" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("spinbutton", { name: "Target after release (optional)" })).not.toBeInTheDocument()
    await choose(canvasElement, "Metric", "Conversion rate")
    const primary = within(canvas.getByRole("region", { name: "Primary metric" }))
    await userEvent.type(primary.getByRole("spinbutton", { name: "Current value" }), "42")
    await userEvent.type(primary.getByRole("spinbutton", { name: "Target after release (optional)" }), "65")
    await expect(primary.getByRole("spinbutton", { name: "Current value" })).toHaveValue(42)
    await expect(primary.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(65)
    await choose(canvasElement, "Metric", "Pass/fail check")
    await expect(primary.queryByRole("spinbutton", { name: "Current value" })).not.toBeInTheDocument()
    await expect(primary.queryByRole("spinbutton", { name: "Target after release (optional)" })).not.toBeInTheDocument()
    await expect(primary.getByRole("combobox", { name: "Test case" })).toBeVisible()
  },
}


// Removing at the cap must return focus after the Add button becomes enabled.
export const RemoveAtGuardrailLimit: Story = {
  args: { initialGuardrails: MAX_MEASUREMENT_GUARDRAILS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const add = canvas.getByRole("button", { name: "Add another guardrail" })
    await expect(add).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Remove guardrail 20" }))
    await waitFor(() => expect(add).toBeEnabled())
    await expect(add).toHaveFocus()
  },
}

// Selecting calendar days advances From to To, and keyboard selection stays usable.
export const CalendarRangeSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Measurement window" })
    const modal = await openCustomDates(canvasElement)
    await userEvent.type(modal.getByLabelText("From"), "2026-10-20")
    await userEvent.click(await modal.findByRole("gridcell", { name: "Wednesday, October 21, 2026" }))
    await expect(modal.getByLabelText("To")).toHaveFocus()
    await expect(modal.getByLabelText("From")).toHaveValue("2026-10-21")
    await userEvent.click(modal.getByRole("gridcell", { name: "Friday, October 23, 2026" }))
    await userEvent.keyboard("{ArrowRight}{Enter}")
    await expect(modal.getByLabelText("To")).toHaveValue("2026-10-24")
    await userEvent.click(modal.getByRole("button", { name: "Apply dates" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveAccessibleDescription("21 Oct 2026 to 24 Oct 2026")
    await openCustomDates(canvasElement)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveTextContent("24 Oct")
  },
}
