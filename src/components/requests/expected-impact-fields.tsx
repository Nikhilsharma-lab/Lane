"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Select } from "@/components/arc/select/select"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { ChevronDown, Ellipsis, Plus, Trash2 } from "lucide-react"
import styles from "./expected-impact-fields.module.css"
import { EMPTY_GUARDRAIL, EMPTY_METRIC_IMPACT, formatGuardrail, guardrailSchema, hasGuardrailEdits, IMPACT_METRIC_MAX, IMPACT_RESULT_MAX, IMPACT_UNIT_MAX, IMPACT_REVIEW_DAYS_MAX, type ExpectedImpactDraft } from "@/lib/request-impact"

type ImpactField = "metric" | "baseline" | "target" | "unit" | "result" | "source" | "reviewAfterDays"
type ImpactErrors = { message?: string; guardrailEdit?: { message?: string }; guardrail?: Partial<Record<"metric" | "operator" | "limit" | "unit", { message?: string }>> } & Partial<Record<ImpactField, { message?: string }>>
const measures = [{ value: "metric", label: "Metric" }, { value: "verification", label: "Verified result" }]
const guardrailConditions = [{ value: "at_most", label: "At or below" }, { value: "at_least", label: "At or above" }]

// Keep intermediate numeric input (a minus sign or decimal point) editable.
// Only finite values enter the saved draft; an empty value is never zero.
function NumberInput({ value, onValueChange, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number | null
  onValueChange: (value: number | null) => void
}) {
  const [entry, setEntry] = useState({ value, text: value === null ? "" : String(value) })
  if (entry.value !== value) setEntry({ value, text: value === null ? "" : String(value) })
  return <Input {...props} type="number" value={entry.text} onChange={(event) => {
    const number = event.target.valueAsNumber
    const next = Number.isFinite(number) ? number : null
    setEntry({ value: next, text: event.target.value })
    onValueChange(next)
  }} />
}

function GuardrailPane({ children }: { children: React.ReactNode }) {
  const present = useIsPresent()
  const reduced = useReducedMotion()
  return <motion.section aria-label="Guardrail editor" aria-hidden={!present || undefined} inert={!present || undefined}
    initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
    exit={{ height: 0, opacity: 0, transition: { duration: reduced ? 0 : motionTokens.duration.exit, ease: [...motionTokens.ease.exit] } }}
    transition={reduced ? { duration: 0 } : motionTokens.spring.smooth} className={styles.guardrailMotion}>
    <div className={styles.guardrailPane}>{children}</div>
  </motion.section>
}

export function ExpectedImpactFields({ value, onChange, disabled, errors, embedded = false }: {
  value: ExpectedImpactDraft
  onChange: (value: ExpectedImpactDraft) => void
  disabled?: boolean
  errors?: ImpactErrors
  /** Plan item 2.3: inside the composer's disclosure, which owns the section, its heading and the rule. */
  embedded?: boolean
}) {
  const previousModes = useRef<Partial<Record<ExpectedImpactDraft["kind"], ExpectedImpactDraft>>>({})
  const optionsRef = useRef<HTMLButtonElement>(null)
  const editGuardrailRef = useRef<HTMLButtonElement>(null)
  const guardrailMetricRef = useRef<HTMLInputElement>(null)
  const baselineRef = useRef<HTMLInputElement>(null)
  const focusAfterChange = useRef<"metric" | "options" | "edit" | "baseline" | null>(null)
  const menuFocus = useRef<"metric" | "options" | null>(null)
  const [guardrailSubmitted, setGuardrailSubmitted] = useState(false)
  const [baselineExpanded, setBaselineExpanded] = useState(false)
  const guardrail = value.guardrail ?? EMPTY_GUARDRAIL
  const editingGuardrail = hasGuardrailEdits(value)
  const parsedGuardrail = guardrailSchema.safeParse(guardrail)
  useEffect(() => {
    if (focusAfterChange.current === "metric") guardrailMetricRef.current?.focus()
    else if (focusAfterChange.current === "options") optionsRef.current?.focus()
    else if (focusAfterChange.current === "edit") editGuardrailRef.current?.focus()
    else if (focusAfterChange.current === "baseline") baselineRef.current?.focus()
    focusAfterChange.current = null
  })
  function beginGuardrail() {
    setGuardrailSubmitted(false)
    focusAfterChange.current = "metric"
    onChange({ ...value, guardrail: value.guardrail ?? { ...EMPTY_GUARDRAIL }, guardrailEdit: { previous: value.guardrail && parsedGuardrail.success ? parsedGuardrail.data : null } })
  }
  function changeGuardrail(next: Partial<NonNullable<ExpectedImpactDraft["guardrail"]>>) {
    onChange({ ...value, guardrail: { ...guardrail, ...next }, guardrailEdit: value.guardrailEdit ?? { previous: null } })
  }
  function saveGuardrail() {
    if (disabled) return
    setGuardrailSubmitted(true)
    if (!parsedGuardrail.success) {
      document.getElementById(`intake-guardrail-${String(parsedGuardrail.error.issues[0].path[0])}`)?.focus()
      return
    }
    focusAfterChange.current = "edit"
    onChange({ ...value, guardrail: parsedGuardrail.data, guardrailEdit: undefined })
    setGuardrailSubmitted(false)
  }
  function cancelGuardrail() {
    const previous = value.guardrailEdit?.previous
    focusAfterChange.current = previous ? "edit" : "options"
    onChange({ ...value, guardrail: previous ?? undefined, guardrailEdit: undefined })
    setGuardrailSubmitted(false)
  }
  function restoreMenuFocus(event: Event) {
    if (!menuFocus.current) return
    event.preventDefault()
    if (menuFocus.current === "metric") guardrailMetricRef.current?.focus()
    else optionsRef.current?.focus()
    menuFocus.current = null
  }
  function changeMeasure(kind: string | null) {
    if (kind !== "metric" && kind !== "verification") return
    previousModes.current[value.kind] = value
    const next = previousModes.current[kind] ?? (kind === "metric" ? EMPTY_METRIC_IMPACT : { kind: "verification", result: "", source: "", reviewAfterDays: null })
    onChange({ ...next, source: value.source, reviewAfterDays: value.reviewAfterDays, guardrail: value.guardrail, guardrailEdit: value.guardrailEdit })
  }
  const fieldError = (name: ImpactField) => errors?.[name]?.message
  const guardrailError = (name: "metric" | "limit" | "unit") => (guardrailSubmitted && !parsedGuardrail.success
    ? parsedGuardrail.error.issues.find(issue => issue.path[0] === name)?.message : undefined) ?? errors?.guardrail?.[name]?.message
  // Embedded in the composer's disclosure, which owns the section, its heading and the rule,
  // the header keeps only the measure and options controls.
  const fields = <fieldset disabled={disabled} className={styles.body}>
      <header className={styles.header}>
        {!embedded && <h2 id="intake-impact-heading" className={styles.heading}>Expected impact</h2>}
        <Select label="Measure with" options={measures} value={value.kind} disabled={disabled} onValueChange={changeMeasure}
          onContentKeyDown={(event) => event.stopPropagation()}
          trigger={<Button type="button" variant="secondary" size="sm" disabled={disabled} aria-label={`Measure with: ${value.kind === "metric" ? "Metric" : "Verified result"}`}>
            {value.kind === "metric" ? "Metric" : "Verified result"}<ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
          </Button>} />
        <div className={styles.more}>
          <DropdownMenu label="Expected impact options" onCloseAutoFocus={restoreMenuFocus} onContentKeyDown={event => event.stopPropagation()}
            trigger={<Button ref={optionsRef} type="button" variant="ghost" size="sm" disabled={disabled} className={styles.iconButton} aria-label="Expected impact options"><Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" /></Button>}
            items={[{ label: "Add guardrail", icon: <Plus size={14} strokeWidth={1.75} aria-hidden="true" />, disabled: disabled || Boolean(value.guardrail) || editingGuardrail, onSelect: () => { menuFocus.current = "metric"; beginGuardrail() } }]} />
        </div>
      </header>
      <div className={styles.fields}>
        {errors?.message && <p role="alert" className={`${styles.wideField} text-sm text-[var(--danger)]`}>{errors.message}</p>}
        {value.kind === "metric" ? <>
          <div className={styles.wideField}><Input className={styles.compactInput} label="What should improve?" id="intake-impact-metric" placeholder="e.g. People completing signup" maxLength={IMPACT_METRIC_MAX} value={value.metric} onChange={(event) => onChange({ ...value, metric: event.target.value })} readOnly={disabled} error={fieldError("metric")} /></div>
          <NumberInput className={styles.compactInput} label="Goal" id="intake-impact-target" placeholder="e.g. 80" step="any" value={value.target} onValueChange={(target) => onChange({ ...value, target })} readOnly={disabled} error={fieldError("target")} />
          <Input className={styles.compactInput} label="Measured in" id="intake-impact-unit" placeholder="%, seconds…" maxLength={IMPACT_UNIT_MAX} value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} readOnly={disabled} error={fieldError("unit")} />
          {(baselineExpanded || value.baseline !== null || fieldError("baseline")) && <NumberInput ref={baselineRef} className={styles.compactInput} label="Today (optional)" id="intake-impact-baseline" placeholder="Unknown" step="any" value={value.baseline} onValueChange={(baseline) => onChange({ ...value, baseline })} readOnly={disabled} error={fieldError("baseline")} />}
        </> : <div className={styles.wideField}><Textarea className={styles.compactTextarea} label="What should be true when this is done?" id="intake-impact-result" rows={2} placeholder="e.g. Customers can reset their password and sign in successfully" maxLength={IMPACT_RESULT_MAX} value={value.result} onChange={(event) => onChange({ ...value, result: event.target.value })} readOnly={disabled} error={fieldError("result")} /></div>}
        <NumberInput className={styles.compactInput} label="Check in days" id="intake-impact-reviewAfterDays" placeholder="e.g. 30" min={1} max={IMPACT_REVIEW_DAYS_MAX} step={1} value={value.reviewAfterDays} onValueChange={(reviewAfterDays) => onChange({ ...value, reviewAfterDays })} readOnly={disabled} error={fieldError("reviewAfterDays")} />
        {value.kind === "metric" && !baselineExpanded && value.baseline === null && !fieldError("baseline") && <Button className={styles.addBaseline} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { focusAfterChange.current = "baseline"; setBaselineExpanded(true) }}><Plus size={14} aria-hidden="true" />Add current value</Button>}
      </div>
      <AnimatePresence initial={false}>
        {editingGuardrail && <GuardrailPane key="guardrail-editor">
          <header className={styles.paneHeader}>
            <h3 className={styles.heading}>{value.guardrailEdit?.previous ? "Edit guardrail" : "Add guardrail"}</h3>
          </header>
          {errors?.guardrailEdit?.message && <p role="alert" className="text-sm text-[var(--danger)]">{errors.guardrailEdit.message}</p>}
          <Input ref={guardrailMetricRef} className={styles.compactInput} label="What should not get worse?" id="intake-guardrail-metric" placeholder="e.g. Support requests" maxLength={IMPACT_METRIC_MAX} value={guardrail.metric} onChange={event => changeGuardrail({ metric: event.target.value })} readOnly={disabled} error={guardrailError("metric")} />
          <div className={styles.guardrailControls}>
              <Select className={styles.compactInput} label="Must stay" id="intake-guardrail-condition" options={guardrailConditions} value={guardrail.operator} disabled={disabled} onContentKeyDown={event => event.stopPropagation()}
              onValueChange={operator => { if (operator === "at_most" || operator === "at_least") changeGuardrail({ operator }) }} />
              <NumberInput className={styles.compactInput} label="Number" id="intake-guardrail-limit" placeholder="e.g. 20" step="any" value={guardrail.limit} onValueChange={limit => changeGuardrail({ limit })} readOnly={disabled} error={guardrailError("limit")} />
              <Input className={styles.compactInput} label="Measured in" id="intake-guardrail-unit" placeholder="e.g. requests per week" maxLength={IMPACT_UNIT_MAX} value={guardrail.unit} onChange={event => changeGuardrail({ unit: event.target.value })} readOnly={disabled} error={guardrailError("unit")} />
          </div>
          <p className={parsedGuardrail.success ? styles.guardrailSentence : styles.hint} aria-live="polite">{parsedGuardrail.success ? formatGuardrail(parsedGuardrail.data) : "Example: no more than 20 support requests per week."}</p>
          <footer className={styles.paneActions}>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label="Cancel guardrail" onClick={cancelGuardrail}>Cancel</Button>
            <Button type="button" size="sm" disabled={disabled} aria-label={value.guardrailEdit?.previous ? "Save guardrail" : "Add guardrail"} onClick={saveGuardrail}>{value.guardrailEdit?.previous ? "Save changes" : "Add guardrail"}</Button>
          </footer>
        </GuardrailPane>}
      </AnimatePresence>
      {!editingGuardrail && value.guardrail && parsedGuardrail.success && <section aria-label="Guardrail" className={styles.guardrailSummary}>
        <div className={styles.summaryCopy}><h3 className={styles.heading}>Guardrail</h3><p className={styles.guardrailSentence}>{formatGuardrail(parsedGuardrail.data)}</p></div>
        <Button ref={editGuardrailRef} type="button" variant="ghost" size="sm" disabled={disabled} aria-label="Edit guardrail" onClick={beginGuardrail}>Edit</Button>
        <DropdownMenu label="Guardrail options" onCloseAutoFocus={restoreMenuFocus} onContentKeyDown={event => event.stopPropagation()}
          trigger={<Button type="button" variant="ghost" size="sm" disabled={disabled} className={styles.iconButton} aria-label="Guardrail options"><Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" /></Button>}
          items={[{ label: "Remove guardrail", destructive: true, disabled, icon: <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />, onSelect: () => {
            menuFocus.current = "options"
            focusAfterChange.current = "options"
            onChange({ ...value, guardrail: undefined, guardrailEdit: undefined })
          } }]} />
      </section>}
    </fieldset>
  // The embedded fields carry the impact container themselves.
  if (embedded) return <div className={styles.embedded}>{fields}</div>
  return <section id="intake-expected-impact" aria-labelledby="intake-impact-heading" tabIndex={-1} className={styles.section}>
    {fields}
  </section>
}
