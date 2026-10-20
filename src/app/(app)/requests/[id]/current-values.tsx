"use client"

import { useState, type FormEvent } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { useRecoverableAction } from "@/hooks/use-recoverable-action"
import { useOptimisticAction } from "@/components/requests/use-optimistic-action"
import { measurementMetricLabel, measurementPlanSchema, measurementReadiness, measurementUnitLabel, type MeasurementPlan } from "@/lib/request-measurement"
import { saveRequestCurrentValues } from "./actions"
import styles from "./current-values.module.css"

function valuesFrom(impact: MeasurementPlan) {
  return { primary: impact.primary.current, guardrails: impact.guardrails.map(metric => metric.current) }
}

/** Recovery for an Open Request. Definitions and units remain the saved ones. */
export function RequestCurrentValues({ requestId, context, impact, requestType }: {
  requestId: string
  context: { orgId: string }
  impact: MeasurementPlan
  requestType?: string | null
}) {
  const optimistic = useOptimisticAction()
  const { pending, run } = useRecoverableAction()
  const [base, setBase] = useState(impact)
  const [source, setSource] = useState(JSON.stringify(impact))
  const [values, setValues] = useState(() => valuesFrom(impact))
  const [expanded, setExpanded] = useState(() => measurementReadiness(impact, requestType) !== null)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToastStack()
  const incoming = JSON.stringify(impact)
  if (source !== incoming) {
    setSource(incoming)
    setBase(impact)
    setValues(valuesFrom(impact))
    setError(null)
  }

  const readiness = measurementReadiness(base, requestType)
  const hasPrimaryValue = base.primary.key !== "check" && !base.primary.noBaseline
  if (!hasPrimaryValue) return null

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const proposed = {
      ...base,
      primary: { ...base.primary, current: values.primary },
      guardrails: base.guardrails.map((metric, index) => ({ ...metric, current: values.guardrails[index] })),
    }
    const parsed = measurementPlanSchema.safeParse(proposed)
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    const outcome = await run(() => optimistic({
      id: requestId,
      run: () => saveRequestCurrentValues(requestId, { expectedImpact: base, ...values }, context),
      waitForPending: true,
      onError: (message, { thrown }) => setError(thrown ? "Couldn’t confirm the save. Your values are still here. Check your connection and try again." : message),
    }))
    if (outcome.status === "blocked") return
    if (outcome.status === "failed") {
      setError("Couldn’t confirm the save. Your values are still here. Check your connection and try again.")
      return
    }
    if (outcome.value.status !== "success" || "error" in outcome.value.value) return
    setBase(outcome.value.value.impact)
    setValues(valuesFrom(outcome.value.value.impact))
    toast({ type: "success", title: "Current values saved", description: measurementReadiness(outcome.value.value.impact, requestType) ?? "This Request is ready to be picked up." })
  }

  function updatePrimary(value: number | null) {
    setValues(current => ({ ...current, primary: value }))
  }

  return <section className={styles.section} aria-label="Current values">
    <div className={styles.header}>
      <div className={styles.copy}>
        <h2 className={styles.heading}>Current values</h2>
        {readiness && <p className={styles.hint}>Add the current numbers before someone picks up this Request. Missing values are never treated as zero.</p>}
      </div>
      {!expanded && <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(true)}>Edit current values</Button>}
    </div>
    {expanded && <form onSubmit={save} className={styles.form}>
      <div className={styles.fields}>
        {hasPrimaryValue && <Input label={measurementMetricLabel(base.primary)} aria-label={`${measurementMetricLabel(base.primary)} current value`} description={measurementUnitLabel(base.primary.unit)} type="number" min={0} max={base.primary.unit === "percent" ? 100 : undefined} step={base.primary.unit === "count" ? 1 : "any"} value={values.primary ?? ""} readOnly={pending} onChange={event => updatePrimary(event.target.value === "" ? null : event.target.valueAsNumber)} />}

      </div>
      {error && <Alert tone="danger" title="Current values not saved">{error}</Alert>}
      <div className={styles.actions}><Button variant="secondary" size="sm" type="submit" loading={pending}>Save current values</Button></div>
    </form>}
  </section>
}
