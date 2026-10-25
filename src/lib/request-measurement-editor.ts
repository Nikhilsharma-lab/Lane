import type { PlanImpactDraft } from "./request-impact"
import type { MetricChoice } from "./metric-definition-rules"
import { createEmptyMeasurementPlan, createMeasurementPrimary, createMeasurementGuardrail, CURRENT_MEASUREMENT_VERSION, MEASUREMENT_METRIC_OPTIONS, measurementMetricLabel, measurementUnitOptions, pickDefinition, type MeasurementPlanDraft, type MeasurementPrimaryDraft, type MeasurementGuardrailDraft } from "./request-measurement"

export type EditorPrimary = Omit<MeasurementPrimaryDraft, "unit"> & { unit: string }
export type EditorGuardrail = Omit<MeasurementGuardrailDraft, "unit"> & { unit: string }
export type EditorPlan = Omit<MeasurementPlanDraft, "primary" | "guardrails" | "measurement"> & {
  primary: EditorPrimary; guardrails: EditorGuardrail[]
  measurement: Omit<MeasurementPlanDraft["measurement"], "windowDays" | "audience" | "platform"> & { windowDays: number | null; audience: MeasurementPlanDraft["measurement"]["audience"] | ""; platform: MeasurementPlanDraft["measurement"]["platform"] | "" }
  evidenceSource?: string; verificationResult?: string
}
export type EditorMetric = EditorPrimary | EditorGuardrail

function metricKey(name: string): EditorMetric["key"] {
  return MEASUREMENT_METRIC_OPTIONS.find(option => option.value !== "custom" && option.value !== "check" && option.label === name)?.value ?? (name ? "custom" : "")
}
export function editorMetricLabel(metric: EditorMetric) {
  return measurementMetricLabel({ ...metric, unit: metric.unit as MeasurementPrimaryDraft["unit"] })
}
export function editorUnitOptions(metric: EditorMetric) {
  const options: { value: string; label: string }[] = measurementUnitOptions(metric.key)
  return metric.unit && !options.some(option => option.value === metric.unit)
    ? [...options, { value: metric.unit, label: metric.unit }] : options
}
const viewUnit = (unit: string) => unit === "%" ? "percent" : unit
const savedUnit = (unit: string) => unit === "percent" ? "%" : unit

/** Presentation adapter only. Opening an older record never migrates or writes it. */
export function measurementEditorValue(impact: PlanImpactDraft): EditorPlan {
  if (impact.kind === "measurement") return impact
  const plan: EditorPlan = createEmptyMeasurementPlan()
  plan.measurement = { ...plan.measurement, audience: "", platform: "", ...impact.measurement, windowDays: impact.reviewAfterDays }
  plan.evidenceSource = impact.source
  if (impact.kind === "metric") plan.primary = { ...createMeasurementPrimary(metricKey(impact.metric)), name: impact.metric, unit: viewUnit(impact.unit), current: impact.baseline, target: impact.target, noBaseline: impact.noBaseline ?? false }
  else {
    plan.primary = createMeasurementPrimary("check")
    plan.verificationResult = impact.result
  }
  plan.guardrails = [...(impact.guardrail ? [impact.guardrail] : []), ...(impact.additionalGuardrails ?? [])].map(guardrail => ({ ...createMeasurementGuardrail(metricKey(guardrail.metric)), name: guardrail.metric, unit: viewUnit(guardrail.unit), current: guardrail.current ?? null, operator: guardrail.operator, limit: guardrail.limit }))
  return plan
}

/** Write back into the saved format, keeping exact custom names and units.
 * Scope and guardrail baselines absent from old records are never persisted as defaults. */
export function measurementEditorChanges(next: EditorPlan, original: PlanImpactDraft): PlanImpactDraft {
  if (original.kind === "measurement") return next as MeasurementPlanDraft
  const previous = measurementEditorValue(original)
  const metricName = (metric: EditorMetric, before: EditorMetric | undefined, saved: string | undefined) =>
    before && metric.key === before.key && metric.name === before.name ? saved ?? "" : metric.key === "custom" ? metric.name : metric.key ? editorMetricLabel(metric) : ""
  const unit = (metric: EditorMetric, before: EditorMetric | undefined, saved: string | undefined) =>
    before && metric.unit === before.unit ? saved ?? "" : savedUnit(metric.unit)
  const { windowDays, ...scope } = next.measurement
  const { windowDays: previousDays, ...previousScope } = previous.measurement
  void previousDays
  const common = { source: next.evidenceSource ?? original.source, reviewAfterDays: windowDays,
    ...(JSON.stringify(scope) !== JSON.stringify(previousScope) ? { measurement: scope } : original.measurement ? { measurement: original.measurement } : {}),
    ...(next.primary.noBaseline || original.noBaseline !== undefined ? { noBaseline: next.primary.noBaseline } : {}),
  }
  const originals = [...(original.guardrail ? [original.guardrail] : []), ...(original.additionalGuardrails ?? [])]
  const guardrails = next.guardrails.map((guardrail, index) => ({
    metric: metricName(guardrail, previous.guardrails[index], originals[index]?.metric),
    unit: unit(guardrail, previous.guardrails[index], originals[index]?.unit),
    operator: guardrail.operator, limit: guardrail.limit,
    ...(guardrail.current !== null || originals[index]?.current !== undefined ? { current: guardrail.current } : {}),
  }))
  const extra = { ...(guardrails[0] ? { guardrail: guardrails[0] } : {}),
    ...(guardrails.length > 1 || original.additionalGuardrails !== undefined ? { additionalGuardrails: guardrails.slice(1) } : {}),
  }
  return next.primary.key === "check"
    ? { kind: "verification", result: next.verificationResult ?? "", ...common, ...extra }
    : { kind: "metric", metric: metricName(next.primary, previous.primary, original.kind === "metric" ? original.metric : undefined),
      unit: unit(next.primary, previous.primary, original.kind === "metric" ? original.unit : undefined), baseline: next.primary.current, target: next.primary.target, ...common, ...extra }
}

/**
 * An older (v2–v4) plan moved onto v5 the first time it is edited (#198). `resolved` is, by position (0 the
 * main metric, then guardrails), the definition the Metrics library resolved each saved metric to. A metric
 * with none, or whose definition is in another unit, is cleared so the person picks it again; `unresolved`
 * names those. The Pass/fail check and the numbers of resolved metrics are kept. A v5 plan is returned as is.
 */
export function upgradePlanMetrics<P extends EditorPlan>(plan: P, resolved: readonly (MetricChoice | null | undefined)[]): { plan: P; unresolved: string[] } {
  if (plan.version >= CURRENT_MEASUREMENT_VERSION) return { plan, unresolved: [] }
  const unresolved: string[] = []
  function upgrade<M extends EditorMetric>(metric: M, position: number, empty: M): M {
    if (metric.key === "check" || metric.key === "" || metric.key === "definition") return { ...metric, definitionId: null }
    const definition = resolved[position]
    if (definition && definition.unit === metric.unit) return pickDefinition(metric, definition) as M
    unresolved.push(editorMetricLabel(metric))
    return empty
  }
  return {
    plan: {
      ...plan, version: CURRENT_MEASUREMENT_VERSION,
      primary: upgrade(plan.primary, 0, { ...createMeasurementPrimary(), noBaseline: plan.primary.noBaseline }),
      guardrails: plan.guardrails.map((guardrail, index) => upgrade(guardrail, index + 1, { ...createMeasurementGuardrail(), operator: guardrail.operator })),
    },
    unresolved,
  }
}
