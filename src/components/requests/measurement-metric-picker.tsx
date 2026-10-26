"use client"

import { useEffect, useId, useRef, useState, type RefObject } from "react"
import { ChartNoAxesColumnIncreasing, Check, ListChecks, Plus } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import {
  inlineMetricInputSchema, METRIC_NAME_MAX, METRIC_UNITS, metricDefinitionFieldErrors, metricUnitName, type MetricChoice,
} from "@/lib/metric-definition-rules"
import { pickerPopoverProps } from "./request-property-pickers"
import type { MetricLibrary } from "./use-metric-library"
import styles from "./measurement-plan-fields.module.css"
import layout from "./request-picker-layout.module.css"

/** The Metrics page, which the prediction form links to (#198). */
export const METRICS_PAGE = "/settings/metrics"

const plain = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase()

/**
 * The definitions the picker shows for what's typed (#198): active ones whose name contains the typed text, ignoring
 * case and extra spaces, and nothing that only looks similar. An archived definition shows only while it is the one
 * selected (already saved on the Request), first.
 */
export function metricPickerOptions(metrics: readonly MetricChoice[], query: string, selectedId: string | null): MetricChoice[] {
  const wanted = plain(query)
  const matches = (metric: MetricChoice) => plain(metric.name).includes(wanted)
  const kept = metrics.filter(metric => metric.archived && metric.id === selectedId && matches(metric))
  return [...kept, ...metrics.filter(metric => !metric.archived && matches(metric))]
}

/** The active definition with exactly this name, ignoring case and extra spaces (#199). */
export function activeMetricNamed(metrics: readonly MetricChoice[], name: string): MetricChoice | null {
  return metrics.find(metric => !metric.archived && plain(metric.name) === plain(name)) ?? null
}

/**
 * What inline add offers to add for what's typed (#199): the typed name, tidied. Nothing while nothing is typed, or
 * when an active definition already has exactly that name (the list shows that one).
 */
export function inlineAddName(metrics: readonly MetricChoice[], query: string): string | null {
  const name = query.trim().replace(/\s+/g, " ")
  return name && !activeMetricNamed(metrics, name) ? name : null
}

/** The facts read with each option: its unit, how it's counted and where it lives. */
function details(metric: MetricChoice) {
  return [metricUnitName(metric.unit), metric.howCounted ?? "How it's counted isn't written down yet", metric.link ?? "No link yet"]
}

/** The listbox: library options, then the Pass/fail check, then adding what's typed, each as its own group. Roving focus is the picker's. */
export function MetricOptionList({ id, options, selectedId, passFail, passFailSelected, onPick, addName = null, onAdd }: {
  id: string; options: MetricChoice[]; selectedId: string | null; passFail: boolean; passFailSelected: boolean
  onPick: (choice: MetricChoice | "check") => void
  /** The name inline add offers to add (#199), or null when there's nothing to offer. */
  addName?: string | null
  onAdd?: () => void
}) {
  return <>
    {options.length > 0 && <div role="group" aria-label="Metrics library" className={styles.metricGroup}>
      {options.map(option => {
        const selected = option.id === selectedId
        return <Button key={option.id} role="option" aria-selected={selected} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption} ${styles.libraryOption}`}
          aria-label={option.archived ? `${option.name}, archived` : option.name} aria-describedby={`${id}-${option.id}-details`} onClick={() => onPick(option)}>
          <Check className={styles.metricCheck} data-selected={selected} aria-hidden="true"/>
          <span className={styles.optionText}>
            <span className={styles.optionName}>{option.name}{option.archived && <span className={styles.optionTag}>Archived</span>}</span>
            <span id={`${id}-${option.id}-details`} className={styles.optionDetails}>{details(option).join(" · ")}</span>
          </span>
        </Button>
      })}
    </div>}
    {passFail && <div role="group" aria-label="Pass/fail check" className={styles.metricGroup}>
      <Button role="option" aria-selected={passFailSelected} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption}`} onClick={() => onPick("check")}>
        <Check className={styles.metricCheck} data-selected={passFailSelected} aria-hidden="true"/>
        <ListChecks className={styles.icon} aria-hidden="true"/><span className={styles.triggerText}>Pass/fail check</span>
      </Button>
    </div>}
    {addName && <div role="group" aria-label="Add to the Metrics library" className={styles.metricGroup}>
      <Button role="option" aria-selected={false} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption} ${styles.libraryOption}`} onClick={onAdd}>
        <Plus className={styles.icon} aria-hidden="true"/>
        <span className={styles.optionName}>{`Add “${addName}”`}</span>
      </Button>
    </div>}
  </>
}

export type InlineMetricValues = { name: string; unit: string }
type InlineFieldErrors = Partial<Record<"name" | "unit", string>>

const UNIT_OPTIONS = METRIC_UNITS.map(unit => ({ value: unit, label: metricUnitName(unit) }))

/**
 * Adding a metric from the picker (#199): a name and a unit only, nothing else. When an active definition already
 * has the name, that one is offered in place of a duplicate. The form lives in the picker's popover, which is
 * portalled: its submit stays its own and never reaches the Request's form.
 */
export function InlineMetricForm({ id, values, fields, error, offer, pending, onChange, onSubmit, onBack, onUseOffer, onRename, nameRef, offerRef }: {
  id: string
  values: InlineMetricValues
  fields: InlineFieldErrors
  error: string | null
  /** The active definition that already has the name, to use instead. */
  offer: MetricChoice | null
  pending: boolean
  onChange: (values: InlineMetricValues) => void
  onSubmit: () => void
  onBack: () => void
  onUseOffer: () => void
  onRename: () => void
  nameRef?: RefObject<HTMLInputElement | null>
  offerRef?: RefObject<HTMLButtonElement | null>
}) {
  return <form className={styles.inlineAdd} noValidate aria-label="Add a metric to the Metrics library" aria-describedby={`${id}-add-note`}
    onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!offer) onSubmit() }}>
    <p id={`${id}-add-note`} className={styles.hint}>It joins the workspace&apos;s Metrics library. Where it lives and how it&apos;s counted can be added on the Metrics page.</p>
    <Input ref={nameRef} label="Name" value={values.name} maxLength={METRIC_NAME_MAX} readOnly={pending} error={fields.name} autoComplete="off"
      onChange={event => onChange({ ...values, name: event.target.value })}/>
    {offer ? <div className={styles.inlineOffer}>
      <p className={styles.hint} role="alert">{`“${offer.name}” is already in the Metrics library, counted as ${metricUnitName(offer.unit)}. Use that one instead.`}</p>
      <div className={styles.inlineActions}>
        <Button ref={offerRef} type="button" size="sm" onClick={onUseOffer}>{`Use “${offer.name}”`}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRename}>Change the name</Button>
      </div>
    </div> : <>
      <div className={styles.inlineUnit} data-field="unit">
        <RadioGroup label="Unit" options={UNIT_OPTIONS} value={values.unit} onValueChange={unit => onChange({ ...values, unit })}/>
        {fields.unit && <p className={styles.error} role="alert">{fields.unit}</p>}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.inlineActions}>
        <Button type="submit" size="sm" loading={pending}>Add and use</Button>
        <Button type="button" size="sm" variant="ghost" aria-disabled={pending || undefined} onClick={() => { if (!pending) onBack() }}>Back</Button>
      </div>
    </>}
  </form>
}

/**
 * Choosing the main metric or a guardrail from the workspace's Metrics library (#198). The search filters by name as
 * you type; Enter takes the first match; arrows, Home and End move through the options. The main metric can also be a
 * Pass/fail check, which is never a definition. There is no typed metric: one that isn't in the library is added
 * from here (#199), by Members and Admins, with a name and a unit, and selected straight away.
 */
export function MeasurementMetricPicker({ id, label, selectedId, passFailSelected, guardrail, disabled, error, library, onPick }: {
  id: string
  /** What the trigger shows: the selected metric's name, or nothing yet. */
  label: string | null
  selectedId: string | null
  passFailSelected: boolean
  guardrail?: boolean
  disabled?: boolean
  error?: string
  library: MetricLibrary
  onPick: (choice: MetricChoice | "check") => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState<InlineMetricValues | null>(null)
  const [fields, setFields] = useState<InlineFieldErrors>({})
  const [addError, setAddError] = useState<string | null>(null)
  const [offer, setOffer] = useState<MetricChoice | null>(null)
  const [pending, setPending] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const offerButton = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const shown = metricPickerOptions(library.metrics, query, selectedId)
  const passFail = !guardrail && plain("Pass/fail check").includes(plain(query))
  const addName = library.status === "ready" && library.canAddMetrics ? inlineAddName(library.metrics, query) : null
  const isAdding = adding !== null

  // Focus follows the view: the name field when adding starts, the search when going back, the offer when one appears.
  useEffect(() => {
    if (open) (isAdding ? nameInput : search).current?.focus()
  }, [open, isAdding])
  useEffect(() => { if (offer) offerButton.current?.focus() }, [offer])

  const stopAdding = () => { setAdding(null); setFields({}); setAddError(null); setOffer(null) }
  const startAdding = (name: string) => { setAdding({ name, unit: "" }); setFields({}); setAddError(null); setOffer(null) }
  const pick = (choice: MetricChoice | "check") => {
    if (choice === "check" ? !passFailSelected : choice.id !== selectedId) onPick(choice)
    setOpen(false); setQuery(""); stopAdding()
  }

  async function addMetric() {
    if (!adding || pending) return
    setAddError(null)
    const parsed = inlineMetricInputSchema.safeParse(adding)
    if (!parsed.success) {
      const problems = metricDefinitionFieldErrors(parsed.error)
      setFields(problems)
      if (problems.name) nameInput.current?.focus()
      else nameInput.current?.closest("form")?.querySelector<HTMLInputElement>('[data-field="unit"] input')?.focus()
      return
    }
    const known = activeMetricNamed(library.metrics, parsed.data.name)
    if (known) { setOffer(known); return }
    setPending(true)
    try {
      const result = await library.add(parsed.data)
      if ("error" in result) {
        setFields(result.fields ?? {})
        if (result.fields?.name) nameInput.current?.focus()
        else if (!result.fields) setAddError(result.error)
      } else if (result.existing) setOffer(result.metric)
      else pick(result.metric)
    } catch {
      setAddError("The metric could not be added. Check your connection and try again; your Request is still here.")
    } finally {
      setPending(false)
    }
  }

  const typed = query.trim().replace(/\s+/g, " ")
  return <div className={styles.field}>
    <Popover open={open} onOpenChange={next => { if (pending) return; setOpen(next); if (!next) { setQuery(""); stopAdding() } }}>
      <PopoverTrigger asChild><Button role="combobox" aria-haspopup="dialog" id={id} type="button" size="sm" variant="secondary" className={styles.compactButton} disabled={disabled}
        aria-label={guardrail ? "Guardrail metric" : "Metric"} aria-invalid={!!error || undefined} aria-describedby={`${id}-value${error ? ` ${id}-error` : ""}`}>
        <ChartNoAxesColumnIncreasing className={styles.icon} aria-hidden="true"/><span id={`${id}-value`} className={styles.triggerText}>{label ?? "Choose a metric"}</span>
      </Button></PopoverTrigger>
      <PopoverContent {...pickerPopoverProps} className={`${layout.panel} ${styles.metricPanel}`} aria-label={isAdding ? "Add a metric" : guardrail ? "Choose a guardrail metric" : "Choose a metric"}
        onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus() }}
        // Escape while adding goes back to the search; the place in the form is kept either way.
        onEscapeKeyDown={event => { if (isAdding) { event.preventDefault(); if (!pending) stopAdding() } }}>
        {adding ? <InlineMetricForm id={id} values={adding} fields={fields} error={addError} offer={offer} pending={pending} nameRef={nameInput} offerRef={offerButton}
          onChange={values => {
            if (pending) return
            setAdding(values)
            setFields(current => ({ ...current, ...(values.name !== adding.name ? { name: undefined } : {}), ...(values.unit !== adding.unit ? { unit: undefined } : {}) }))
            if (values.name !== adding.name) setOffer(null)
          }}
          onSubmit={() => void addMetric()} onBack={stopAdding} onUseOffer={() => offer && pick(offer)}
          onRename={() => { setOffer(null); nameInput.current?.focus() }}/> : <>
          <div className={layout.header}><Input ref={search} label="Search the Metrics library" hideLabel appearance="plain" placeholder="Search metrics…" maxLength={120} value={query}
            aria-controls={listId} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault()
                if (shown[0]) pick(shown[0])
                else if (passFail) pick("check")
                else if (addName) startAdding(addName)
              }
              if (event.key === "ArrowDown") { event.preventDefault(); event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('[role="option"]')?.focus() }
            }}/></div>
          <div id={listId} role="listbox" aria-label={guardrail ? "Guardrail metrics" : "Metrics"} aria-busy={library.status === "loading" || undefined} className={styles.metricOptions} onKeyDown={event => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
            const index = items.indexOf(event.target as HTMLButtonElement)
            if (index < 0) return
            event.preventDefault()
            if (event.key === "ArrowUp" && index === 0) { search.current?.focus(); return }
            items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
          }}>
            <MetricOptionList id={id} options={library.status === "ready" ? shown : []} selectedId={selectedId} passFail={passFail} passFailSelected={passFailSelected} onPick={pick}
              addName={addName} onAdd={() => addName && startAdding(addName)} />
          </div>
          <div className={styles.metricStatus}>
            {library.status === "loading" && <p className={styles.hint} role="status">Loading the Metrics library…</p>}
            {library.status === "error" && <div className={styles.metricError}>
              <p className={styles.error} role="alert">{library.error}</p>
              <Button type="button" size="sm" variant="secondary" onClick={library.reload}>Try again</Button>
            </div>}
            {library.status === "ready" && !shown.length && <p className={styles.hint} role="status">
              {typed ? `No metric in the library is called “${typed}”.` : "The Metrics library has no metrics to pick yet."}
              {!library.canAddMetrics && " A Member or Admin can add it to the Metrics library."}
            </p>}
            {library.canOpenLibrary && <a className={styles.libraryLink} href={METRICS_PAGE} target="_blank" rel="noopener noreferrer">
              Open the Metrics library<span className="sr-only"> (opens in a new tab)</span>
            </a>}
          </div>
        </>}
      </PopoverContent>
    </Popover>
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
  </div>
}
