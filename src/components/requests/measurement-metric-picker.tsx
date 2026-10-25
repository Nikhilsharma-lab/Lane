"use client"

import { useId, useRef, useState } from "react"
import { ChartNoAxesColumnIncreasing, Check, ListChecks } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { metricUnitName, type MetricChoice } from "@/lib/metric-definition-rules"
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

/** The facts read with each option: its unit, how it's counted and where it lives. */
function details(metric: MetricChoice) {
  return [metricUnitName(metric.unit), metric.howCounted ?? "How it's counted isn't written down yet", metric.link ?? "No link yet"]
}

/** The listbox: library options, then the Pass/fail check as its own group. Roving focus is the picker's. */
export function MetricOptionList({ id, options, selectedId, passFail, passFailSelected, onPick }: {
  id: string; options: MetricChoice[]; selectedId: string | null; passFail: boolean; passFailSelected: boolean
  onPick: (choice: MetricChoice | "check") => void
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
  </>
}

/**
 * Choosing the main metric or a guardrail from the workspace's Metrics library (#198). The search filters by name as
 * you type; Enter takes the first match; arrows, Home and End move through the options. The main metric can also be a
 * Pass/fail check, which is never a definition. There is no typed metric: one that isn't in the library is added on
 * the Metrics page.
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
  const search = useRef<HTMLInputElement>(null)
  const listId = useId()
  const shown = metricPickerOptions(library.metrics, query, selectedId)
  const passFail = !guardrail && plain("Pass/fail check").includes(plain(query))
  const pick = (choice: MetricChoice | "check") => {
    if (choice === "check" ? !passFailSelected : choice.id !== selectedId) onPick(choice)
    setOpen(false); setQuery("")
  }
  const typed = query.trim().replace(/\s+/g, " ")
  return <div className={styles.field}>
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery("") }}>
      <PopoverTrigger asChild><Button role="combobox" aria-haspopup="dialog" id={id} type="button" size="sm" variant="secondary" className={styles.compactButton} disabled={disabled}
        aria-label={guardrail ? "Guardrail metric" : "Metric"} aria-invalid={!!error || undefined} aria-describedby={`${id}-value${error ? ` ${id}-error` : ""}`}>
        <ChartNoAxesColumnIncreasing className={styles.icon} aria-hidden="true"/><span id={`${id}-value`} className={styles.triggerText}>{label ?? "Choose a metric"}</span>
      </Button></PopoverTrigger>
      <PopoverContent {...pickerPopoverProps} className={`${layout.panel} ${styles.metricPanel}`} aria-label={guardrail ? "Choose a guardrail metric" : "Choose a metric"}
        onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus() }}>
        <div className={layout.header}><Input ref={search} label="Search the Metrics library" hideLabel appearance="plain" placeholder="Search metrics…" maxLength={120} value={query}
          aria-controls={listId} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault()
              if (shown[0]) pick(shown[0])
              else if (passFail) pick("check")
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
          <MetricOptionList id={id} options={library.status === "ready" ? shown : []} selectedId={selectedId} passFail={passFail} passFailSelected={passFailSelected} onPick={pick} />
        </div>
        <div className={styles.metricStatus}>
          {library.status === "loading" && <p className={styles.hint} role="status">Loading the Metrics library…</p>}
          {library.status === "error" && <div className={styles.metricError}>
            <p className={styles.error} role="alert">{library.error}</p>
            <Button type="button" size="sm" variant="secondary" onClick={library.reload}>Try again</Button>
          </div>}
          {library.status === "ready" && !shown.length && <p className={styles.hint} role="status">
            {typed ? `No metric in the library is called “${typed}”.` : "The Metrics library has no metrics to pick yet."}
            {library.canOpenLibrary && " Add it on the Metrics page."}
          </p>}
          {library.canOpenLibrary && <a className={styles.libraryLink} href={METRICS_PAGE} target="_blank" rel="noopener noreferrer">
            Open the Metrics library<span className="sr-only"> (opens in a new tab)</span>
          </a>}
        </div>
      </PopoverContent>
    </Popover>
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
  </div>
}
