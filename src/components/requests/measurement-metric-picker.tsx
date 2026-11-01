"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ArrowUpRight, ChartNoAxesColumnIncreasing, Check, ListChecks, Plus } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import dynamic from "next/dynamic"
import type { MetricDefinitionValues } from "@/components/metrics/metric-definition-form"
import { SearchField } from "@/components/arc/search-field/search-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import {
  metricUnitName, type MetricChoice,
} from "@/lib/metric-definition-rules"
import { pickerPopoverProps } from "./request-property-pickers"
import type { MetricLibrary } from "./use-metric-library"
import styles from "./measurement-plan-fields.module.css"
import layout from "./request-picker-layout.module.css"
import { Placeholder } from "@/components/loading/placeholder";
import { FieldError } from "@/components/forms/field-error"

const GuidedMetricForm = dynamic(() => import("@/components/metrics/guided-metric-form").then(module => module.GuidedMetricForm), { loading: () => <p role="status">Loading metric setup…</p> });

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

/** The listbox: library options, then the Pass/fail check, then adding what's typed, each as its own group. Roving focus is the picker's. */
export function MetricOptionList({ id, options, selectedId, passFail, passFailSelected, onPick, addName = null, onAdd }: {
  id: string; options: MetricChoice[]; selectedId: string | null; passFail: boolean; passFailSelected: boolean
  onPick: (choice: MetricChoice | "check") => void
  /** The name inline add offers to add (#199), or null when there's nothing to offer. */
  addName?: string | null
  onAdd?: () => void
}) {
  const [focused, setFocused] = useState<string | null>(null)
  const keys = [...options.map(option => option.id), ...(passFail ? ["check"] : []), ...(addName ? ["add"] : [])]
  const preferred = passFailSelected ? "check" : selectedId
  const active = focused && keys.includes(focused) ? focused : preferred && keys.includes(preferred) ? preferred : keys[0]
  const focusProps = (key: string) => ({ tabIndex: key === active ? 0 : -1, onFocus: () => setFocused(key) })
  return <>
    {options.length > 0 && <div role="group" aria-label="Metrics library" className={styles.metricGroup}>
      {options.map(option => {
        const selected = option.id === selectedId
        return <Button key={option.id} {...focusProps(option.id)} morph="plain" role="option" aria-selected={selected} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption} ${styles.libraryOption}`}
          aria-label={option.archived ? `${option.name}, archived` : option.name} aria-describedby={`${id}-${option.id}-details`} onClick={() => onPick(option)}>
          <Check className={styles.metricCheck} data-selected={selected} aria-hidden="true"/>
          <span className={styles.optionText}>
            <span className={styles.optionName}>{option.name}{option.archived && <span className={styles.optionTag}>Archived</span>}</span>
            <span id={`${id}-${option.id}-details`} className={styles.optionDetails}>{metricUnitName(option.unit)}</span>
          </span>
        </Button>
      })}
    </div>}
    {passFail && <div role="group" aria-label="Pass/fail check" className={styles.metricGroup}>
      <Button {...focusProps("check")} morph="plain" role="option" aria-selected={passFailSelected} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption}`} onClick={() => onPick("check")}>
        <Check className={styles.metricCheck} data-selected={passFailSelected} aria-hidden="true"/>
        <ListChecks className={styles.icon} aria-hidden="true"/><span className={styles.triggerText}>Pass/fail check</span>
      </Button>
    </div>}
    {addName && <div role="group" aria-label="Add to the Metrics library" className={styles.metricGroup}>
      <Button {...focusProps("add")} morph="plain" role="option" aria-selected={false} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption} ${styles.libraryOption}`} onClick={onAdd}>
        <Plus className={styles.icon} aria-hidden="true"/>
        <span className={styles.optionName}>{`Add “${addName}”`}</span>
      </Button>
    </div>}
  </>
}

/**
 * Choosing the main metric or a guardrail from the workspace's Metrics library (#198). The search filters by name as
 * you type; Enter takes the first match; arrows, Home and End move through the options. The main metric can also be a
 * Pass/fail check, which is never a definition. There is no typed metric: one that isn't in the library is added
 * from here (#199), by Members and Admins, with a name and a unit, and selected straight away.
 */
export function MeasurementMetricPicker({ id, label, selectedId, passFailSelected, guardrail, disabled, error, library, onPick, onBusyChange }: {
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
  onBusyChange?: (busy: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState<{name:string} | null>(null)
  const [offer, setOffer] = useState<MetricChoice | null>(null)
  const [pending, setPending] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const addForm = useRef<HTMLDivElement>(null)
  const offerButton = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const shown = metricPickerOptions(library.metrics, query, selectedId)
  const passFail = !guardrail && plain("Pass/fail check").includes(plain(query))
  const addName = library.status === "ready" && library.canAddMetrics ? inlineAddName(library.metrics, query) : null
  const isAdding = adding !== null

  // Focus follows the view: the name field when adding starts, the search when going back, the offer when one appears.
  useEffect(() => {
    if (open) { if (isAdding) addForm.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus(); else search.current?.focus() }
  }, [open, isAdding])
  useEffect(() => { if (offer) offerButton.current?.focus() }, [offer])

  const stopAdding = () => { setAdding(null); setOffer(null) }
  const startAdding = (name: string) => { setAdding({ name }); setOffer(null) }
  const pick = (choice: MetricChoice | "check") => {
    if (choice === "check" ? !passFailSelected : choice.id !== selectedId) onPick(choice)
    setOpen(false); setQuery(""); stopAdding()
  }

  async function addMetric(values: MetricDefinitionValues) {
    const known = activeMetricNamed(library.metrics, values.name)
    if (known) { setOffer(known); return {error:'A metric with this name already exists. Review it below, or change the name.'} }
    const result = await library.add(values)
    if ('error' in result) return result
    if (result.existing) {setOffer(result.metric);return {error:'A metric with this name already exists. Review it below, or change the name.'}}
    pick(result.metric)
    return {ok:true as const}
  }

  const typed = query.trim().replace(/\s+/g, " ")
  return <div className={styles.field}>
    <Popover open={open} onOpenChange={next => { if (pending) return; setOpen(next); if (!next) { setQuery(""); stopAdding() } }}>
      <PopoverTrigger asChild><Button role="combobox" aria-haspopup="dialog" id={id} type="button" size="sm" variant="secondary" className={styles.compactButton} disabled={disabled}
        aria-label={guardrail ? "Guardrail metric" : "Metric"} aria-invalid={!!error || undefined} aria-describedby={`${id}-value${error ? ` ${id}-error` : ""}`}>
        <ChartNoAxesColumnIncreasing className={styles.icon} aria-hidden="true"/><span id={`${id}-value`} className={styles.triggerText}>{label ?? "Choose a metric"}</span>
      </Button></PopoverTrigger>
      <PopoverContent {...pickerPopoverProps} inert={open ? undefined : true} className={`${layout.panel} ${styles.metricPanel}`} aria-label={isAdding ? "Add a metric" : guardrail ? "Choose a guardrail metric" : "Choose a metric"}
        onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus() }}
        // Escape while adding goes back to the search; the place in the form is kept either way.
        onEscapeKeyDown={event => { if (isAdding) { event.preventDefault(); if (!pending) stopAdding() } }}>
        {adding ? <div ref={addForm} className={styles.inlineAdd}><GuidedMetricForm initialName={adding.name} onCancel={stopAdding} onSubmit={addMetric}
          onPendingChange={busy=>{setPending(busy);onBusyChange?.(busy)}} />
          {offer && <div className={styles.inlineOffer}><p className={styles.hint}>{offer.name} · {metricUnitName(offer.unit)}</p>{offer.howCounted && <p className={styles.hint}>{offer.howCounted}</p>}<Button ref={offerButton} type="button" disabled={pending} onClick={()=>pick(offer)}>Use this metric</Button></div>}
        </div> : <>
          <div className={layout.header}><SearchField ref={search} label="Search the Metrics library" hideLabel placeholder="Search metrics…" maxLength={120} value={query}
            aria-controls={listId} onValueChange={setQuery} onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (event.key === "Enter") {
                event.preventDefault()
                if (library.status === "ready" && shown[0]) pick(shown[0])
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
            {library.status === "loading" && <Placeholder label="Loading the Metrics library" lines={1} />}
            {library.status === "error" && <div className={styles.metricError}>
              <p className={styles.error} role="alert">{library.error}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => { search.current?.focus(); library.reload(); }}>Try again</Button>
            </div>}
            {library.status === "ready" && !shown.length && <p className={styles.hint} role="status">
              {typed ? `No metric in the library is called “${typed}”.` : "The Metrics library has no metrics to pick yet."}
              {!library.canAddMetrics && " A Member or Admin can add it to the Metrics library."}
            </p>}
          </div>
          {library.canOpenLibrary && <div className={styles.metricFooter}>
            <a className={styles.libraryLink} href={METRICS_PAGE} target="_blank" rel="noopener noreferrer">
              Metrics library<ArrowUpRight data-icon-size="sm" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>}
        </>}
      </PopoverContent>
    </Popover>
    <FieldError id={`${id}-error`}>{error}</FieldError>
  </div>
}
