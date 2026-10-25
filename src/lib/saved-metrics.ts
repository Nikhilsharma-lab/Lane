import { STARTER_METRIC_KEYS, type StarterMetricKey } from "./metric-definition-rules";
import { measurementMetricLabel, type MeasurementMetricKey, type MeasurementUnit } from "./request-measurement";

/**
 * The metrics a saved Expected impact names (#200), in any version Lane has saved: measurement plans v2–v4
 * (built-in key or typed "custom" name, with a unit) and the older free-text Metric / Verified result kinds.
 * Client-safe and pure. The Metrics library resolves these to definitions (`resolveSavedMetrics`).
 * Mirrors pg_temp.saved_metrics() in migration 0038, which made the definitions they resolve to.
 */
export type SavedMetricRef =
  | { kind: "builtin"; key: StarterMetricKey; unit: string }
  | { kind: "typed"; name: string; unit: string };

export type SavedMetric = {
  role: "primary" | "guardrail";
  /** 0 for the main metric; guardrails count from 1 in saved order (older kinds: `guardrail`, then `additionalGuardrails`). */
  position: number;
  /** The metric's name as the Request saved it. */
  savedName: string;
  ref: SavedMetricRef;
};

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const isStarterKey = (key: unknown): key is StarterMetricKey => (STARTER_METRIC_KEYS as readonly unknown[]).includes(key);

function planMetric(metric: unknown, position: number): SavedMetric | null {
  if (!isObject(metric) || !text(metric.unit).trim()) return null;
  const role = position === 0 ? "primary" : "guardrail";
  const unit = text(metric.unit);
  if (isStarterKey(metric.key)) {
    const savedName = measurementMetricLabel({ key: metric.key, name: text(metric.name), unit: unit as MeasurementUnit });
    return { role, position, savedName, ref: { kind: "builtin", key: metric.key, unit } };
  }
  const name = text(metric.name);
  if ((metric.key as MeasurementMetricKey) !== "custom" || !name.trim()) return null;
  return { role, position, savedName: name.trim(), ref: { kind: "typed", name, unit } };
}

function typedMetric(name: unknown, unit: unknown, position: number): SavedMetric | null {
  if (!text(name).trim() || !text(unit).trim()) return null;
  return { role: position === 0 ? "primary" : "guardrail", position, savedName: text(name).trim(), ref: { kind: "typed", name: text(name), unit: text(unit) } };
}

/** Every metric one saved Expected impact (current, draft, older revision or a closure's `expected`) names. */
export function savedMetricsOf(impact: unknown): SavedMetric[] {
  if (!isObject(impact)) return [];
  const found: (SavedMetric | null)[] = [];
  if (impact.kind === "measurement") {
    found.push(planMetric(impact.primary, 0));
    if (Array.isArray(impact.guardrails)) impact.guardrails.forEach((guardrail, index) => found.push(planMetric(guardrail, index + 1)));
  } else if (impact.kind === "metric" || impact.kind === "verification") {
    if (impact.kind === "metric") found.push(typedMetric(impact.metric, impact.unit, 0));
    if (isObject(impact.guardrail)) found.push(typedMetric(impact.guardrail.metric, impact.guardrail.unit, 1));
    if (Array.isArray(impact.additionalGuardrails))
      impact.additionalGuardrails.forEach((guardrail, index) => found.push(isObject(guardrail) ? typedMetric(guardrail.metric, guardrail.unit, index + 2) : null));
  }
  return found.filter((metric): metric is SavedMetric => metric !== null);
}
