import { expect, it } from "vitest"
import { measurementEditorChanges, measurementEditorValue } from "./request-measurement-editor"
import { createEmptyMeasurementPlan } from "./request-measurement"
import type { ExpectedImpactDraft } from "./request-impact"

const metric: ExpectedImpactDraft = { kind: "metric", metric: "Revenue per visit", baseline: 0, target: 12.5, unit: "USD / visit", source: "Saved report", reviewAfterDays: 45,
  guardrail: { metric: "Refund cost", operator: "at_most", limit: 3.5, unit: "USD" } }
it.each<ExpectedImpactDraft>([
  metric,
  { ...metric, baseline: null, unit: "%", target: 90 },
  { ...metric, baseline: -5, target: -1 },
  { kind: "verification", result: "A customer can recover their basket.", source: "Customer recording", reviewAfterDays: 21 },
  { kind: "metric", metric: "", unit: "", baseline: null, target: null, source: "", reviewAfterDays: null },
  createEmptyMeasurementPlan(),
])("round trips saved values without migration or invented data: %#", original => {
  expect(measurementEditorChanges(measurementEditorValue(original), original)).toEqual(original)
})
it("changes only the edited value in an older record", () => {
  const edited = measurementEditorValue(metric)
  edited.primary.target = 15
  expect(measurementEditorChanges(edited, metric)).toEqual({ ...metric, target: 15 })
})
it("does not store placeholder audience, platform or guardrail baseline", () => {
  const saved = measurementEditorChanges(measurementEditorValue(metric), metric)
  expect(saved).not.toHaveProperty("measurement")
  expect("guardrail" in saved && saved.guardrail).not.toHaveProperty("current")
})
it("leaves absent scope blank and persists explicitly selected scope", () => {
  const editor = measurementEditorValue(metric)
  expect(editor.measurement.audience).toBe("")
  expect(editor.measurement.platform).toBe("")
  editor.measurement.audience = "returning"
  editor.measurement.platform = "web"
  const saved = measurementEditorChanges(editor, metric)
  const reopened = measurementEditorValue(saved)
  expect(reopened.measurement).toMatchObject({ audience: "returning", platform: "web", windowDays: 45 })
  expect(saved).toMatchObject(metric)
})
it("retains added guardrails, current values, custom scope and dates after reopening", () => {
  const editor = measurementEditorValue(metric)
  editor.guardrails[0].current = 2
  editor.guardrails.push({ ...editor.guardrails[0], name: "Additional guardrail", current: 1, limit: 4 })
  editor.measurement = { ...editor.measurement, audience: "custom", audienceName: "Returning buyers", platform: "ios", exactDates: true, startDate: "2026-10-01", endDate: "2026-10-15" }
  const saved = measurementEditorChanges(editor, metric)
  expect(measurementEditorValue(saved)).toEqual(editor)
})
