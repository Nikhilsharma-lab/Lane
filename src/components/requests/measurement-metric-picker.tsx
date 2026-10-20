"use client"

import { useRef, useState } from "react"
import { ChartNoAxesColumnIncreasing, Check, Plus } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { MEASUREMENT_METRIC_OPTIONS, type MeasurementMetricKey } from "@/lib/request-measurement"
import { editorMetricLabel, type EditorMetric } from "@/lib/request-measurement-editor"
import { pickerPopoverProps } from "./request-property-pickers"
import styles from "./measurement-plan-fields.module.css"
import layout from "./request-picker-layout.module.css"

export function MeasurementMetricPicker({ id, metric, guardrail, disabled, error, onSelect }: {
  id: string; metric: EditorMetric; guardrail?: boolean; disabled?: boolean; error?: string
  onSelect: (key: MeasurementMetricKey, name?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const search = useRef<HTMLInputElement>(null)
  const name = query.trim().replace(/\s+/g, " ")
  const options = MEASUREMENT_METRIC_OPTIONS.filter(option => option.value !== "custom" && (!guardrail || option.value !== "check"))
  if (metric.key === "custom" && metric.name.trim()) options.push({ value: "custom", label: metric.name })
  const shown = options.filter(option => option.label.toLowerCase().startsWith(name.toLowerCase()))
  const select = (key: MeasurementMetricKey, customName?: string) => {
    if (key !== metric.key || (key === "custom" && customName !== metric.name)) onSelect(key, customName)
    setOpen(false); setQuery("")
  }
  return <div className={styles.field}>
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery("") }}>
      <PopoverTrigger asChild><Button role="combobox" aria-haspopup="dialog" id={id} type="button" size="sm" variant="secondary" className={styles.compactButton} disabled={disabled}
        aria-label={guardrail ? "Guardrail metric" : "Metric"} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined}>
        <ChartNoAxesColumnIncreasing className={styles.icon} aria-hidden="true"/><span className={styles.triggerText}>{metric.key ? editorMetricLabel(metric) : "Choose a metric"}</span>
      </Button></PopoverTrigger>
      <PopoverContent {...pickerPopoverProps} className={`${layout.panel} ${styles.metricPanel}`} aria-label="Choose a metric"
        onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus() }}>
        <div className={layout.header}><Input ref={search} label="Search metrics" hideLabel appearance="plain" placeholder="Search or create a metric…" maxLength={120} value={query}
          onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault()
              if (shown[0]) select(shown[0].value, shown[0].value === "custom" ? shown[0].label : undefined)
              else if (name) select("custom", name)
            }
            if (event.key === "ArrowDown") { event.preventDefault(); event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('[role="option"]')?.focus() }
          }}/></div>
        <div role="listbox" aria-label="Metrics" className={styles.metricOptions} onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
          const index = items.indexOf(event.target as HTMLButtonElement)
          if (index < 0) return
          event.preventDefault()
          items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
        }}>
          {shown.map(option => <Button key={option.value} role="option" aria-selected={metric.key === option.value} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption}`}
            onClick={() => select(option.value, option.value === "custom" ? option.label : undefined)}>
            <Check className={styles.metricCheck} data-selected={metric.key === option.value} aria-hidden="true"/><span className={styles.triggerText}>{option.label}</span>
          </Button>)}
          {!shown.length && name && <Button role="option" aria-selected={false} type="button" size="sm" variant="ghost" className={`${layout.row} ${styles.metricOption} ${styles.createMetric}`} onClick={() => select("custom", name)}>
            <Plus aria-hidden="true"/><span className={styles.triggerText}>Create metric: “{name}”</span>
          </Button>}
        </div>
      </PopoverContent>
    </Popover>
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
  </div>
}
