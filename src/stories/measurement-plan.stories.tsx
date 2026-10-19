import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields"
import { MeasurementDateDialog } from "@/components/requests/measurement-date-dialog"
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

function dateInCurrentMonth(day: number) {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), day)
}

function dateLabel(date: Date) {
  return date.toLocaleDateString("en-US", { dateStyle: "full" })
}

function rangeLabel(start: Date, end: Date) {
  const format = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return `${format(start)} to ${format(end)}`
}

async function rangeDay(modal: ReturnType<typeof within>, date: Date) {
  // Arc keeps leaving month panes mounted for their exit motion, but inert.
  return waitFor(() => {
    const days = modal.getAllByRole("button", { name: dateLabel(date) }).filter((day: HTMLElement) => !day.closest("[inert]"))
    expect(days).toHaveLength(1)
    return days[0]
  })
}

async function openCustomDates(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Measurement window" }))
  const page = within(canvasElement.ownerDocument.body)
  await userEvent.click(await page.findByRole("menuitem", { name: "Custom date range…" }))
  const modal = within(await page.findByRole("dialog", { name: "Measurement date range" }))
  // The calendar loads on demand; the first open in a session can show its skeleton for a moment.
  await modal.findByRole("button", { name: "Apply" })
  return modal
}

// Arc orders reversed endpoints; selecting or cancelling a draft must never save it.
export const ExactDatesAndValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Measurement window" })
    const start = dateInCurrentMonth(19)
    const end = dateInCurrentMonth(25)
    await expect(trigger).toHaveTextContent("Measurement dates")
    let modal = await openCustomDates(canvasElement)
    await expect(modal.getByRole("button", { name: "Apply" })).toBeDisabled()
    await userEvent.click(await rangeDay(modal, end))
    await userEvent.click(await rangeDay(modal, start))
    await expect((await rangeDay(modal, dateInCurrentMonth(22))).closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true")
    await expect(trigger).toHaveTextContent("Measurement dates")
    await userEvent.click(modal.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveAccessibleDescription(rangeLabel(start, end))
    modal = await openCustomDates(canvasElement)
    await expect((await rangeDay(modal, start)).closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true")
    await expect((await rangeDay(modal, end)).closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true")
    await userEvent.click(await rangeDay(modal, dateInCurrentMonth(10)))
    await userEvent.click(await rangeDay(modal, dateInCurrentMonth(12)))
    await userEvent.click(modal.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveAccessibleDescription(rangeLabel(start, end))
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
    await userEvent.click(await rangeDay(modal, dateInCurrentMonth(1)))
    await userEvent.click(await rangeDay(modal, dateInCurrentMonth(7)))
    await userEvent.click(modal.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(canvas.getByRole("button", { name: "Measurement window" })).toHaveFocus())
    await expect(canvas.getByRole("spinbutton", { name: "Current value" })).toHaveValue(42)
    await userEvent.clear(canvas.getByRole("spinbutton", { name: "Current value" }))
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Current value" }), "39")
    modal = await openCustomDates(canvasElement)
    await userEvent.click(await rangeDay(modal, dateInCurrentMonth(1)))
    await userEvent.click(await rangeDay(modal, dateInCurrentMonth(14)))
    await userEvent.click(modal.getByRole("button", { name: "Apply" }))
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

// Arrow-key range selection stays in the date dialog and commits only on Apply.
export const CalendarRangeSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Measurement window" })
    const start = dateInCurrentMonth(21)
    const end = dateInCurrentMonth(24)
    const modal = await openCustomDates(canvasElement)
    const firstDay = await rangeDay(modal, start)
    firstDay.focus()
    await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{ArrowRight}{Enter}")
    await expect(await rangeDay(modal, end)).toHaveFocus()
    await expect((await rangeDay(modal, dateInCurrentMonth(22))).closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true")
    await userEvent.click(modal.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveAccessibleDescription(rangeLabel(start, end))
    await openCustomDates(canvasElement)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveAccessibleDescription(rangeLabel(start, end))
  },
}

// The adapter must keep Arc's inclusive one-day range instead of requiring two different dates.
export const CalendarSameDayRange: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Measurement window" })
    const date = dateInCurrentMonth(15)
    const modal = await openCustomDates(canvasElement)
    await userEvent.click(await rangeDay(modal, date))
    await userEvent.click(modal.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveAccessibleDescription(rangeLabel(date, date))
  },
}

// Moving across a month boundary must extend the same range, not reset its start.
export const CalendarCrossMonthRange: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Measurement window" })
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const modal = await openCustomDates(canvasElement)
    await userEvent.click(await rangeDay(modal, start))
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(async () => expect(await rangeDay(modal, end)).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    await userEvent.click(modal.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveAccessibleDescription(rangeLabel(start, end))
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

function RapidReopenDateFixture() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [dates, setDates] = useState({ startDate: "", endDate: "" })
  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Open measurement dates</button>
    <MeasurementDateDialog open={open} onOpenChange={setOpen} {...dates} returnFocusRef={triggerRef}
      onApply={(startDate, endDate) => setDates({ startDate, endDate })} />
  </>
}

// Reopening before Arc's exit finishes must discard the cancelled draft too.
export const CalendarRapidReopenDiscardsDraft: Story = {
  render: () => <RapidReopenDateFixture />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Open measurement dates" })
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(trigger)
    const dialog = await page.findByRole("dialog", { name: "Measurement date range" })
    const modal = within(dialog)
    await userEvent.click(await rangeDay(modal, dateInCurrentMonth(20)))
    await expect(modal.getByRole("button", { name: "Apply" })).toBeEnabled()
    // Flush both real clicks without an animation-frame wait, so the existing
    // dialog is retargeted while its exit is still mounted.
    flushSync(() => { fireEvent.click(modal.getByRole("button", { name: "Cancel" })) })
    flushSync(() => { fireEvent.click(trigger) })
    const reopened = within(await page.findByRole("dialog", { name: "Measurement date range" }))
    await waitFor(() => expect(reopened.getByRole("button", { name: "Apply" })).toBeDisabled())
    await expect((await rangeDay(reopened, dateInCurrentMonth(20))).closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "false")
    await userEvent.click(reopened.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}
