"use client"

import { useRef, useState } from "react"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import { EMPTY_METRIC_IMPACT, IMPACT_METRIC_MAX, IMPACT_RESULT_MAX, IMPACT_SOURCE_MAX, IMPACT_UNIT_MAX, IMPACT_REVIEW_DAYS_MAX, type ExpectedImpactDraft } from "@/lib/request-impact"

type ImpactErrors = { message?: string } & Partial<Record<"metric" | "baseline" | "target" | "unit" | "result" | "source" | "reviewAfterDays", { message?: string }>>
const measures = [{ value: "metric", label: "Metric" }, { value: "verification", label: "Verified result" }]

// Keep intermediate numeric input (a minus sign or decimal point) editable.
// Only finite values enter the saved draft; an empty value is never zero.
function NumberInput({ value, onValueChange, suffix, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number | null
  onValueChange: (value: number | null) => void
  suffix?: string
}) {
  const [entry, setEntry] = useState({ value, text: value === null ? "" : String(value) })
  if (entry.value !== value) setEntry({ value, text: value === null ? "" : String(value) })
  return <Input {...props} description={suffix} type="number" value={entry.text} onChange={(event) => {
    const number = event.target.valueAsNumber
    const next = Number.isFinite(number) ? number : null
    setEntry({ value: next, text: event.target.value })
    onValueChange(next)
  }} />
}

export function ExpectedImpactFields({ value, onChange, disabled, errors }: {
  value: ExpectedImpactDraft
  onChange: (value: ExpectedImpactDraft) => void
  disabled?: boolean
  errors?: ImpactErrors
}) {
  const previousModes = useRef<Partial<Record<ExpectedImpactDraft["kind"], ExpectedImpactDraft>>>({})
  function changeMeasure(kind: string | null) {
    if (kind !== "metric" && kind !== "verification") return
    previousModes.current[value.kind] = value
    const next = previousModes.current[kind] ?? (kind === "metric" ? EMPTY_METRIC_IMPACT : { kind: "verification", result: "", source: "", reviewAfterDays: null })
    onChange({ ...next, source: value.source, reviewAfterDays: value.reviewAfterDays })
  }
  const fieldError = (name: Exclude<keyof ImpactErrors, "message">) => errors?.[name]?.message
  return <section id="intake-expected-impact" aria-labelledby="intake-impact-heading" tabIndex={-1} className="space-y-5 border-t pt-5">
    <h2 id="intake-impact-heading" className="text-base font-medium">Expected impact</h2>
    <fieldset disabled={disabled} className="space-y-5">
      <RadioGroup label="Measure with" name="intake-impact-kind" options={measures} value={value.kind} onValueChange={changeMeasure} />
      {errors?.message && <p role="alert" className="text-sm text-[var(--danger)]">{errors.message}</p>}
      {value.kind === "metric" ? <>
        <Input label="Metric" id="intake-impact-metric" placeholder="e.g. Signup completion rate" maxLength={IMPACT_METRIC_MAX} value={value.metric} onChange={(event) => onChange({ ...value, metric: event.target.value })} readOnly={disabled} error={fieldError("metric")} />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberInput label="Current value (optional)" id="intake-impact-baseline" placeholder="Not measured yet" step="any" value={value.baseline} onValueChange={(baseline) => onChange({ ...value, baseline })} readOnly={disabled} error={fieldError("baseline")} />
          <NumberInput label="Target value" id="intake-impact-target" placeholder="e.g. 80" step="any" value={value.target} onValueChange={(target) => onChange({ ...value, target })} readOnly={disabled} error={fieldError("target")} />
          <Input label="Unit" id="intake-impact-unit" placeholder="e.g. %" maxLength={IMPACT_UNIT_MAX} value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} readOnly={disabled} error={fieldError("unit")} />
        </div>
      </> : <Textarea label="Success criterion" id="intake-impact-result" rows={2} placeholder="e.g. Customers can reset their password and sign in successfully" maxLength={IMPACT_RESULT_MAX} value={value.result} onChange={(event) => onChange({ ...value, result: event.target.value })} readOnly={disabled} error={fieldError("result")} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2"><Input label="Data source" id="intake-impact-source" placeholder={value.kind === "metric" ? "e.g. Amplitude signup funnel" : "e.g. Password reset test on supported browsers"} maxLength={IMPACT_SOURCE_MAX} value={value.source} onChange={(event) => onChange({ ...value, source: event.target.value })} readOnly={disabled} error={fieldError("source")} /></div>
        <NumberInput label="Measure after launch" id="intake-impact-reviewAfterDays" placeholder="e.g. 30" min={1} max={IMPACT_REVIEW_DAYS_MAX} step={1} suffix="Days after launch" value={value.reviewAfterDays} onValueChange={(reviewAfterDays) => onChange({ ...value, reviewAfterDays })} readOnly={disabled} error={fieldError("reviewAfterDays")} />
      </div>
    </fieldset>
  </section>
}
