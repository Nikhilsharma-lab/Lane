"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { CalendarDays, Check, ListChecks, Monitor, Plus, Users } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { IMPACT_SOURCE_MAX, IMPACT_RESULT_MAX, guardrailSchema, expectedImpactDraftSchema, type PlanImpactDraft } from "@/lib/request-impact"
import { Select } from "@/components/arc/select/select"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { MeasurementDateDialog } from "./measurement-date-dialog"
import { GUARDRAIL_COMPARISONS } from "@/lib/guardrail-comparison"
import { preloadDateRangePicker } from "@/components/date-range-picker-lazy"
import type { RequestType } from "@/lib/request-constants"
import {
  changeMetricUnit, createMeasurementGuardrail, createMeasurementPrimary,
  MAX_MEASUREMENT_GUARDRAILS, MEASUREMENT_SCOPE_NAME_MAX,
  measurementPlanSchema, measurementRequestTypeIssue,
} from "@/lib/request-measurement"
import { measurementEditorValue, measurementEditorChanges, editorUnitOptions, type EditorPlan, type EditorPrimary, type EditorGuardrail, type EditorMetric } from "@/lib/request-measurement-editor"
import { MeasurementMetricPicker } from "./measurement-metric-picker"
import styles from "./measurement-plan-fields.module.css"

type Metric = EditorMetric
type Option = { value: string; label: string; disabled?: boolean; icon?: ReactNode; trailing?: ReactNode }
const audiences = [{ value: "all", label: "All users" }, { value: "new", label: "New users" }, { value: "returning", label: "Returning users" }, { value: "custom", label: "Add custom audience…" }]
const platforms = [{ value: "all", label: "All platforms" }, { value: "web", label: "Web" }, { value: "ios", label: "iOS" }, { value: "android", label: "Android" }, { value: "custom", label: "Add custom platform…" }]
const windows = [7, 14, 30, 90].map(days => ({ value: String(days), label: `${days} days after release` }))
const boundaries = GUARDRAIL_COMPARISONS
const checks = {
  keyboard: { label: "Keyboard navigation", steps: "Complete the flow described in this Request using only Tab, Shift+Tab, Enter and Space.", pass: "Every control is reachable, focus is visible, and the flow can be completed without a pointer." },
  required: { label: "Required-field validation", steps: "Leave each required field empty in turn and submit the form described in this Request.", pass: "Submission is blocked, each missing field is identified, and valid entries allow submission." },
  recovery: { label: "Network error recovery", steps: "Disconnect the network before submitting the flow described in this Request, reconnect, then retry.", pass: "Entered details remain available, an error is shown, and retry completes the action once without creating a duplicate." },
}
const checkOptions = Object.entries(checks).map(([value, check]) => ({ value, label: check.label }))

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** Arc owns popup positioning, typeahead, arrow keys, Escape and focus return. */
function CompactSelect({ id, label, value, options, onChange, disabled, error, icon, placeholder = "Choose an option", selectedLabel, hideLabel = false, indicatorPosition }: {
  id: string; label: string; value: string; options: Option[]; onChange: (value: string) => void
  disabled?: boolean; error?: string; icon?: ReactNode; placeholder?: string; selectedLabel?: string; hideLabel?: boolean; indicatorPosition?: "left" | "right"
}) {
  const shown = selectedLabel ?? options.find(option => option.value === value)?.label ?? placeholder
  return <div className={styles.field}>
    {!hideLabel && <div className={styles.labelRow}><span id={`${id}-label`} className={styles.label}>{label}</span></div>}
    <Select indicatorPosition={indicatorPosition} id={id} label={label} value={value} options={options} disabled={disabled} onValueChange={next => {
      // Radix's native form bridge can emit an empty change when dependent
      // options mount. Only a real option may replace the controlled value.
      if (options.some(option => option.value === next && !option.disabled)) onChange(next)
    }}
      onContentKeyDown={event => event.stopPropagation()}
      trigger={<Button type="button" size="sm" variant="secondary" disabled={disabled} className={styles.compactButton}
        aria-label={hideLabel ? label : undefined} aria-labelledby={hideLabel ? undefined : `${id}-label`}
        aria-invalid={Boolean(error) || undefined} aria-describedby={`${id}-value${error ? ` ${id}-error` : ""}`} title={shown}>
        <span className={styles.triggerContent}>{icon}<span id={`${id}-value`} className={styles.triggerText}>{shown}</span></span>
      </Button>} />
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
  </div>
}

function NumberField({ id, label, value, onChange, metricKey, unit, unitOptions, onUnitChange, unitLabel, disabled, noBaseline = false, error, unrestricted = false, hideLabel = false }: {
  id: string; label: string; value: number | null; onChange: (value: number | null) => void
  metricKey: Metric["key"]; unit: Metric["unit"]; unitOptions?: Option[]; onUnitChange?: (unit: Metric["unit"]) => void; unitLabel?: string
  disabled?: boolean; noBaseline?: boolean; error?: string; unrestricted?: boolean; hideLabel?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [initialValue] = useState(() => value === null ? "" : String(value))
  const syncedRevision = useRef(0)
  const [entry, setEntry] = useState({ value, unit, metricKey, noBaseline, invalid: false, revision: 0 })
  if (entry.value !== value || entry.unit !== unit || entry.metricKey !== metricKey || entry.noBaseline !== noBaseline) {
    setEntry({ value, unit, metricKey, noBaseline, invalid: false, revision: entry.revision + 1 })
  }
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    // Preserve the browser's intermediate numeric text (such as 1e) while
    // typing. Only external model/unit changes replace the visible entry.
    if (syncedRevision.current !== entry.revision) {
      input.value = entry.noBaseline || entry.value === null ? "" : String(entry.value)
      syncedRevision.current = entry.revision
    }
    input.setCustomValidity(entry.invalid ? "Enter a valid number." : "")
  }, [entry])
  const message = entry.invalid ? "Enter a valid number." : error
  return <div className={styles.field}>
    <div className={hideLabel ? styles.srOnly : styles.labelRow}><label id={`${id}-label`} htmlFor={id} className={styles.label}>{label}</label></div>
    <div className={styles.valueControl}>
      <Input ref={inputRef} id={id} label={label} hideLabel className={styles.numericInput} type="number" min={unrestricted ? undefined : 0}
        max={!unrestricted && unit === "percent" ? 100 : undefined} step={!unrestricted && unit === "count" ? 1 : "any"}
        disabled={disabled || !unit || noBaseline} placeholder={noBaseline ? "No existing data" : unit ? hideLabel ? "Value" : "Enter value" : "Choose a metric and unit"}
        defaultValue={initialValue} aria-labelledby={`${id}-label`} aria-invalid={Boolean(message) || undefined} aria-describedby={message ? `${id}-message` : undefined}
        onInput={event => {
          // Invalid numeric text and a cleared field both expose value="".
          // onInput also catches that validity-only edit; onChange skips it.
          const input = event.currentTarget
          const invalid = input.validity.badInput
          const next = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null
          input.setCustomValidity(invalid ? "Enter a valid number." : "")
          setEntry({ ...entry, value: next, invalid })
          onChange(next)
        }} />
      <div className={styles.unitControl}>
        <CompactSelect id={`${id}-unit`} label={unitLabel ?? `${label} unit`} hideLabel value={unit} options={unitOptions ?? []}
          selectedLabel={unit === "percent" ? "%" : unit === "seconds" ? "sec" : unit === "minutes" ? "min" : unit === "count" ? "Count" : undefined}
          placeholder="Unit" disabled={disabled || !unitOptions?.length} onChange={next => onUnitChange?.(next as Metric["unit"])} />
      </div>
    </div>
    {message && <p id={`${id}-message`} className={styles.error} role="alert">{message}</p>}
  </div>
}

function SectionHeader({ title, action, optional }: { title: string; action?: ReactNode; optional?: boolean }) {
  return <header className={styles.sectionHeader}>
    <h2>{title}{optional && <span className={styles.optional}>Optional</span>}</h2>
    {action}
  </header>
}

/** All saved formats use this one renderer and its controls. */
export function MeasurementPlanFields<T extends PlanImpactDraft>({ value, onChange, ...props }: {
  value: T; onChange: (value: T) => void
  requestType: RequestType | null; disabled?: boolean; submitted?: boolean
}) {
  const source = JSON.stringify(expectedImpactDraftSchema.parse(value))
  const [editor, setEditor] = useState(() => ({ source, plan: measurementEditorValue(value) }))
  if (editor.source !== source) setEditor({ source, plan: measurementEditorValue(value) })
  const recovery = value.kind !== "measurement" ? value.guardrailEdit : undefined
  return <><MeasurementFields value={editor.plan} legacy={value.kind !== "measurement"}
    onChange={next => {
      const converted = measurementEditorChanges(next, value)
      const saved = { ...converted, ...(recovery ? { guardrailEdit: recovery } : {}) } as T
      // Keep in-progress picker choices (e.g. a custom metric before it has a
      // name) even when the older saved format cannot encode that UI state.
      setEditor({ source: JSON.stringify(expectedImpactDraftSchema.parse(saved)), plan: next })
      onChange(saved)
    }} {...props} />
    {recovery && value.kind !== "measurement" && <div>
      <p>Finish or cancel the guardrail changes restored from your draft.</p>
      <Button type="button" variant="secondary" disabled={props.disabled || !guardrailSchema.safeParse(value.guardrail).success} onClick={() => {
        const next = { ...value }; if (next.kind === "measurement") return; delete next.guardrailEdit; onChange(next)
      }}>Keep guardrail changes</Button>
      <Button type="button" variant="ghost" disabled={props.disabled} onClick={() => {
        const next = { ...value }; if (next.kind === "measurement") return; delete next.guardrailEdit
        if (recovery.previous) next.guardrail = recovery.previous
        else delete next.guardrail
        onChange(next)
      }}>Cancel guardrail</Button>
    </div>}
  </>
}

function MeasurementFields({ value, onChange, requestType, disabled = false, submitted = false, legacy }: {
  value: EditorPlan; onChange: (value: EditorPlan) => void
  requestType: RequestType | null; disabled?: boolean; submitted?: boolean; legacy: boolean
}) {
  const prefix = useId()
  const addRef = useRef<HTMLButtonElement>(null)
  const windowRef = useRef<HTMLButtonElement>(null)
  const openDatesAfterMenu = useRef(false)
  const [datesOpen, setDatesOpen] = useState(false)
  const focusAfterAdd = useRef<string | null>(null)
  const focusAfterRemove = useRef(false)
  const [notice, setNotice] = useState("")
  const [guardrailRows, setGuardrailRows] = useState(() => ({
    keys: value.guardrails.map((_, index) => index), nextKey: value.guardrails.length,
  }))
  if (guardrailRows.keys.length !== value.guardrails.length) {
    // A restored/replaced draft can supply a different number of rows.
    setGuardrailRows({ keys: value.guardrails.map((_, index) => guardrailRows.nextKey + index), nextKey: guardrailRows.nextKey + value.guardrails.length })
  }
  useEffect(() => {
    if (focusAfterRemove.current) {
      addRef.current?.focus()
      focusAfterRemove.current = false
    }
    if (!focusAfterAdd.current) return
    document.getElementById(focusAfterAdd.current)?.focus()
    focusAfterAdd.current = null
  })
  const parsed = measurementPlanSchema.safeParse(value)
  const issues = legacy || parsed.success ? [] : parsed.error.issues
  const error = (path: string, edited = false) => submitted || edited ? issues.find(issue => issue.path.join(".") === path)?.message : undefined
  const primary = value.primary
  const measurement = value.measurement
  const primaryException = requestType === "new_feature" && primary.noBaseline
  const typeIssue = measurementRequestTypeIssue(legacy ? { kind: "metric", noBaseline: primary.noBaseline, baseline: primary.current } : value, requestType)
  const changePrimary = (next: Partial<EditorPrimary>) => onChange({ ...value, version: 4, primary: { ...primary, ...next } })
  const changeGuardrail = (index: number, next: Partial<EditorGuardrail>) => onChange({ ...value, version: 4, guardrails: value.guardrails.map((guardrail, position) => position === index ? { ...guardrail, ...next } : guardrail) })
  function changeUnit(metric: Metric, next: Metric["unit"], update: (metric: Metric) => void) {
    const conversion = ["seconds", "minutes"].includes(metric.unit) && ["seconds", "minutes"].includes(next)
    if (metric.unit !== next && !conversion && (metric.current !== null || ("target" in metric && metric.target !== null) || ("limit" in metric && metric.limit !== null))) {
      setNotice("Unit changed. Enter numbers in the new unit.")
    }
    update(changeMetricUnit(metric, next))
  }
  function changeMeasurement(next: Partial<EditorPlan["measurement"]>) {
    onChange({ ...value, measurement: { ...measurement, ...next } })
  }
  const windowLabel = measurement.exactDates
    ? measurement.startDate && measurement.endDate
      ? `${formatDate(measurement.startDate)} to ${formatDate(measurement.endDate)}`
      : "Custom date range"
    // The default 30-day window names itself like any other (critique 2.3); only a missing window reads as the placeholder.
    : legacy ? measurement.windowDays === null ? "Measurement dates" : `${measurement.windowDays} days after release` : windows.find(option => option.value === String(measurement.windowDays))?.label ?? "Measurement dates"
  const metricPicker = (metric: Metric, path: string, update: (key: Metric["key"], name?: string) => void, guardrail = false) => <MeasurementMetricPicker
    id={`${prefix}-${path}-key`} metric={metric} guardrail={guardrail} disabled={disabled}
    error={error(`${path}.key`) || error(`${path}.name`)} onSelect={update} />

  return <section id="intake-expected-impact" aria-label="Request measurement" tabIndex={-1} className={styles.plan}>
    <fieldset disabled={disabled} className={styles.body}>
      <section className={styles.section} aria-label="Primary metric">
        <SectionHeader title="Primary metric" />
        <div className={styles.metricRow}>
          {metricPicker(primary, "primary", (key, name) => { setNotice(""); onChange({ ...value, version: 4, primary: { ...createMeasurementPrimary(key), ...(name ? { name, unit: "percent" } : {}) } }) })}
        </div>
        {primary.key && (primary.key === "check" ? <>
          <CompactSelect id={`${prefix}-check`} label="Test case" value={legacy && !primary.check && value.verificationResult !== undefined ? "saved" : primary.check} options={legacy && value.verificationResult !== undefined ? [{ value: "saved", label: "Saved verified result" }, ...checkOptions] : checkOptions} placeholder="Choose a test case"
            disabled={disabled} error={error("primary.check")} onChange={check => onChange({ ...value,
              primary: { ...primary, check: check === "saved" ? "" : check as EditorPrimary["check"] },
              ...(legacy && check !== "saved" ? { verificationResult: checks[check as keyof typeof checks].pass } : {}),
            })}
            icon={<ListChecks className={styles.icon} aria-hidden="true" />} />
          {legacy && !primary.check && value.verificationResult !== undefined && <Textarea label="Verified result" value={value.verificationResult} maxLength={IMPACT_RESULT_MAX} disabled={disabled} onChange={event => onChange({ ...value, verificationResult: event.target.value })} />}
          {primary.check && <div className={styles.checkDefinition}><h3>Test steps</h3><p>{checks[primary.check].steps}</p><h3>Pass criterion</h3><p>{checks[primary.check].pass}</p></div>}
        </> : <>
          <div className={styles.twoColumns}>
            <NumberField unrestricted={legacy} id={`${prefix}-current`} label="Current value" value={primary.current} metricKey={primary.key} unit={primary.unit} disabled={disabled} noBaseline={primaryException}
              error={error("primary.current", primary.current !== null)} onChange={current => changePrimary({ current })}
              unitOptions={editorUnitOptions(primary)}
              onUnitChange={unit => changeUnit(primary, unit, metric => onChange({ ...value, version: 4, primary: metric as EditorPrimary }))} />
            <NumberField unrestricted={legacy} id={`${prefix}-target`} label="Target after release (optional)" value={primary.target} metricKey={primary.key} unit={primary.unit} disabled={disabled}
              error={error("primary.target", primary.target !== null)} onChange={target => changePrimary({ target })}
              unitOptions={editorUnitOptions(primary)} onUnitChange={unit => changeUnit(primary, unit, metric => onChange({ ...value, version: 4, primary: metric as EditorPrimary }))} />
          </div>
          {(requestType === "new_feature" || primary.noBaseline) && primary.key && <Checkbox
            label="No existing data. This is a brand-new feature." checked={primary.noBaseline} disabled={disabled}
            onCheckedChange={checked => changePrimary({ noBaseline: checked === true, current: checked === true ? null : primary.current })} />}
          {typeIssue && <p className={styles.error} role="alert">{typeIssue}</p>}
        </>)}
      </section>

      <section className={styles.section} aria-label="Measurement">
        <SectionHeader title="Define measurement" />
        <div className={styles.measurementPills}>
          <CompactSelect id={`${prefix}-audience`} label="Audience" placeholder="Audience" hideLabel value={measurement.audience} options={audiences} disabled={disabled}
            selectedLabel={measurement.audience === "custom" ? measurement.audienceName?.trim() || "Custom audience" : undefined}
            icon={<Users className={styles.icon} aria-hidden="true" />} onChange={audience => changeMeasurement({ audience: audience as typeof measurement.audience })} />
          <CompactSelect id={`${prefix}-platform`} label="Platform" placeholder="Platform" hideLabel value={measurement.platform} options={platforms} disabled={disabled}
            selectedLabel={measurement.platform === "custom" ? measurement.platformName?.trim() || "Custom platform" : undefined}
            icon={<Monitor className={styles.icon} aria-hidden="true" />} onChange={platform => changeMeasurement({ platform: platform as typeof measurement.platform })} />
          <DropdownMenu label="Measurement window" onContentKeyDown={event => event.stopPropagation()}
            onCloseAutoFocus={event => {
              if (!openDatesAfterMenu.current) return
              event.preventDefault()
              openDatesAfterMenu.current = false
              setDatesOpen(true)
            }}
            trigger={<Button ref={windowRef} id={`${prefix}-window`} type="button" size="sm" variant="secondary" disabled={disabled}
              className={styles.compactButton} aria-label="Measurement window" aria-describedby={`${prefix}-window-value`} title={windowLabel}
              onPointerEnter={preloadDateRangePicker} onFocus={preloadDateRangePicker}>
              <span className={styles.triggerContent}><CalendarDays className={styles.icon} aria-hidden="true" /><span id={`${prefix}-window-value`} className={styles.triggerText}>{windowLabel}</span></span>
            </Button>}
            items={[
              ...(legacy && measurement.windowDays !== null && !windows.some(option => Number(option.value) === measurement.windowDays) ? [...windows, { value: String(measurement.windowDays), label: `${measurement.windowDays} days after release` }] : windows).map(option => ({
                label: option.label,
                icon: <CalendarDays className={styles.icon} aria-hidden="true" />,
                trailingIcon: <Check className={styles.menuCheck} data-selected={!measurement.exactDates && option.value === String(measurement.windowDays)} aria-hidden="true" />,
                onSelect: () => changeMeasurement({ windowDays: Number(option.value) as typeof measurement.windowDays, exactDates: false }),
              })),
              { label: "Custom date range…", separatorBefore: true, icon: <CalendarDays className={styles.icon} aria-hidden="true" />,
                onSelect: () => { openDatesAfterMenu.current = true } },
            ]} />
        </div>
        {legacy && <Input label="Evidence source" value={value.evidenceSource ?? ""} maxLength={IMPACT_SOURCE_MAX} disabled={disabled} onChange={event => onChange({ ...value, evidenceSource: event.target.value })} />}
        {(measurement.audience === "custom" || measurement.platform === "custom") && <div className={styles.twoColumns}>
          {measurement.audience === "custom" && <Input label="Custom audience" value={measurement.audienceName ?? ""} maxLength={MEASUREMENT_SCOPE_NAME_MAX} disabled={disabled}
            error={error("measurement.audienceName")} onChange={event => changeMeasurement({ audienceName: event.target.value })} />}
          {measurement.platform === "custom" && <Input label="Custom platform" value={measurement.platformName ?? ""} maxLength={MEASUREMENT_SCOPE_NAME_MAX} disabled={disabled}
            error={error("measurement.platformName")} onChange={event => changeMeasurement({ platformName: event.target.value })} />}
        </div>}
        {(error("measurement.startDate") || error("measurement.endDate")) && <p className={styles.error} role="alert">{error("measurement.startDate") || error("measurement.endDate")}</p>}
        <MeasurementDateDialog open={datesOpen} onOpenChange={setDatesOpen} startDate={measurement.startDate} endDate={measurement.endDate} returnFocusRef={windowRef}
          onApply={(startDate, endDate) => { changeMeasurement({ exactDates: true, startDate, endDate }); setDatesOpen(false) }} />
      </section>

      {value.guardrails.map((guardrail, index) => {
        const path = `guardrails.${index}`
        return <section key={guardrailRows.keys[index]} className={styles.section} aria-label={`Guardrail ${index + 1}`}>
          <SectionHeader title="Guardrail" optional
            action={<Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Remove guardrail ${index + 1}`} onClick={() => {
              focusAfterRemove.current = true
              setGuardrailRows({ ...guardrailRows, keys: guardrailRows.keys.filter((_, position) => position !== index) })
              onChange({ ...value, guardrails: value.guardrails.filter((_, position) => position !== index) })
            }}>Remove</Button>} />
          <div className={styles.guardrailControls}>
            {metricPicker(guardrail, path, (key, name) => changeGuardrail(index, { ...createMeasurementGuardrail(key as EditorGuardrail["key"]), ...(name ? { name, unit: "percent" } : {}) }), true)}
          {guardrail.key && <div className={styles.thresholdRow}>
            <CompactSelect id={`${prefix}-${path}-boundary`} label="Comparison" hideLabel value={guardrail.operator}
              indicatorPosition="left" options={boundaries.map(option => ({ ...option, trailing: option.symbol }))} disabled={disabled}
              onChange={operator => changeGuardrail(index, { operator: operator as EditorGuardrail["operator"] })} />
            <NumberField hideLabel unrestricted={legacy} id={`${prefix}-${path}-limit`} label="Value" value={guardrail.limit} metricKey={guardrail.key} unit={guardrail.unit} disabled={disabled}
              error={error(`${path}.limit`, guardrail.limit !== null)} onChange={limit => changeGuardrail(index, { limit })}
              unitOptions={editorUnitOptions(guardrail)} onUnitChange={unit => changeUnit(guardrail, unit, metric => changeGuardrail(index, metric as EditorGuardrail))} />
          </div>}
          </div>

        </section>
      })}
      <Button ref={addRef} type="button" variant="ghost" size="sm" className={styles.addGuardrail} disabled={disabled || value.guardrails.length >= MAX_MEASUREMENT_GUARDRAILS}
        onClick={() => {
          focusAfterAdd.current = `${prefix}-guardrails.${value.guardrails.length}-key`
          setGuardrailRows({ keys: [...guardrailRows.keys, guardrailRows.nextKey], nextKey: guardrailRows.nextKey + 1 })
          onChange({ ...value, guardrails: [...value.guardrails, createMeasurementGuardrail()] })
        }}>
        <Plus className={styles.icon} aria-hidden="true" />{value.guardrails.length ? "Add another guardrail" : "Add guardrail"}
      </Button>
      {notice && <p className={styles.hint} role="status">{notice}</p>}
    </fieldset>
  </section>
}
