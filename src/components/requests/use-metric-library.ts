"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { addPredictionMetric, listPredictionMetrics, type InlineMetricResult } from "@/app/(app)/intake/metric-actions"
import { callAction } from "@/lib/action-call"
import type { MetricChoice } from "@/lib/metric-definition-rules"
import { savedMetricsOf } from "@/lib/saved-metrics"

/** The Metrics library as the prediction form reads it (#198). */
export type MetricLibrary = {
  status: "loading" | "ready" | "error"
  metrics: MetricChoice[]
  /** By position (0 the main metric, then guardrails): the definition each metric of the form's prediction resolved to. */
  saved: (MetricChoice | null)[]
  canOpenLibrary: boolean
  /** Whether this person can add a metric from the form (#199; not Guests). */
  canAddMetrics: boolean
  error: string | null
  reload: () => void
  /** Adds a metric with a name and a unit (#199). The definition that comes back, new or already there, joins `metrics`. */
  add: (input: { name: string; unit: string }) => Promise<InlineMetricResult>
}

type LibraryState = Omit<MetricLibrary, "reload" | "add">

/** What the library must be asked about: older metrics it hasn't resolved, and definitions it hasn't offered. */
function needsOf(impact: unknown, metrics: MetricChoice[]) {
  const offered = new Set(metrics.map(metric => metric.id))
  return JSON.stringify(savedMetricsOf(impact).flatMap(({ position, ref }): unknown[] =>
    ref.kind === "definition" ? (offered.has(ref.id) ? [] : [ref.id]) : [[position, ref]]))
}

/** The library's metrics with one more, in the library's order (by name), replacing any older copy of it. */
function withMetric(metrics: MetricChoice[], metric: MetricChoice) {
  return [...metrics.filter(existing => existing.id !== metric.id), metric]
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id))
}

/**
 * Reads the library once the form opens, and again only when the prediction in the form names something it hasn't
 * been asked about (a recovered draft). The read goes through the guarded action; failures leave a retry. With no
 * `orgId` (a closed composer before its first open) nothing is read, and nothing counts as asked.
 */
export function useMetricLibrary(orgId: string | undefined, impact: unknown): MetricLibrary {
  const [state, setState] = useState<LibraryState>({ status: "loading", metrics: [], saved: [], canOpenLibrary: false, canAddMetrics: false, error: null })
  const asked = useRef<Set<string> | null>(null)
  const latest = useRef(impact)
  useEffect(() => { latest.current = impact })
  const run = useRef(0)

  const load = useCallback(() => {
    if (!orgId) return
    const attempt = ++run.current
    const current = latest.current
    setState(previous => ({ ...previous, status: "loading", error: null }))
    void callAction(() => listPredictionMetrics({ impact: current }, { orgId })).then(result => {
      if (attempt !== run.current) return
      if ("error" in result) setState(previous => ({ ...previous, status: "error", error: result.error }))
      else setState({ status: "ready", metrics: result.metrics, saved: result.saved, canOpenLibrary: result.canOpenLibrary, canAddMetrics: result.canAddMetrics, error: null })
    }, () => {
      if (attempt === run.current) setState(previous => ({ ...previous, status: "error", error: "The Metrics library couldn't be loaded. Check your connection and try again." }))
    })
  }, [orgId])

  const add = useCallback(async (input: { name: string; unit: string }): Promise<InlineMetricResult> => {
    if (!orgId) return { error: "The Metrics library isn't available here." }
    const result = await callAction(() => addPredictionMetric(input, { orgId }))
    if ("ok" in result) setState(previous => ({ ...previous, metrics: withMetric(previous.metrics, result.metric) }))
    return result
  }, [orgId])

  const needs = needsOf(impact, state.metrics)
  useEffect(() => {
    if (!orgId) return
    const items = (JSON.parse(needs) as unknown[]).map(item => JSON.stringify(item))
    if (asked.current !== null && items.every(item => asked.current!.has(item))) return
    asked.current = new Set([...(asked.current ?? []), ...items])
    load()
  }, [needs, load, orgId])

  return { ...state, reload: load, add }
}
