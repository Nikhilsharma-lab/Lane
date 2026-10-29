import { plannedDay } from "@/lib/dates"
import { formatGuardrail, type ExpectedImpact, type IncompleteMeasurement } from "@/lib/request-impact"
import { MeasurementPlanSummary } from "./measurement-plan-summary"
import { measurementAudienceLabel, measurementPlatformLabel } from "@/lib/request-measurement"

/** Plan item 2.5: Request detail passes id="expected-impact", a stable region its strip and stories address; the heading takes `${id}-heading`. */
export function ExpectedImpactSummary({ impact, id, metricNames }: { impact: ExpectedImpact | IncompleteMeasurement; id?: string; metricNames?: Record<string, string> }) {
  if (impact.kind === "measurement") return <MeasurementPlanSummary id={id} plan={impact} metricNames={metricNames} />
  const values = impact.kind === "metric"
    ? [
      { label: "Metric", value: impact.metric },
      { label: "Current value", value: impact.baseline === null ? "Not measured yet" : `${impact.baseline} ${impact.unit}` },
      { label: "Target value", value: impact.target === null ? "" : `${impact.target} ${impact.unit}` },
    ]
    : [{ label: "Success criterion", value: impact.result }]

  return <section id={id} aria-label={id ? undefined : "Expected impact"} aria-labelledby={id ? `${id}-heading` : undefined} className="space-y-3">
    <h2 id={id ? `${id}-heading` : undefined} className="text-base font-medium">Expected impact</h2>
    <dl className="grid gap-4 sm:grid-cols-2">
      {[...values,
        ...[...(impact.guardrail ? [impact.guardrail] : []), ...(impact.additionalGuardrails ?? [])].flatMap((guardrail, index) => [
          { label: index ? `Guardrail ${index + 1}` : "Guardrail metric", value: formatGuardrail(guardrail) },
        ]),
        ...(impact.measurement?.audience ? [{ label: "Audience", value: measurementAudienceLabel({ audience: impact.measurement.audience, audienceName: impact.measurement.audienceName }) }] : []),
        ...(impact.measurement?.platform ? [{ label: "Platform", value: measurementPlatformLabel({ platform: impact.measurement.platform, platformName: impact.measurement.platformName }) }] : []),
        ...(impact.measurement?.exactDates ? [{ label: "Measurement dates", value: `${plannedDay(impact.measurement.startDate)} to ${plannedDay(impact.measurement.endDate)}` }] : []),
        ...(impact.source ? [{ label: "Data source", value: impact.source }] : []),
        ...(impact.reviewAfterDays === null ? [] : [{ label: "Check in", value: `${impact.reviewAfterDays} ${impact.reviewAfterDays === 1 ? "day" : "days"}` }]),
      ].filter(({ value }) => value !== "").map(({ label, value }) => <div key={label} className="min-w-0 space-y-1 sm:first:col-span-2">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{value}</dd>
      </div>)}
    </dl>
  </section>
}
