import { formatGuardrail, type ExpectedImpact } from "@/lib/request-impact"
import { MeasurementPlanSummary } from "./measurement-plan-summary"

/** Plan item 2.5: Request detail passes id="expected-impact", a stable region its strip and stories address; the heading takes `${id}-heading`. */
export function ExpectedImpactSummary({ impact, id }: { impact: ExpectedImpact; id?: string }) {
  if (impact.kind === "measurement") return <MeasurementPlanSummary id={id} plan={impact} />
  const values = impact.kind === "metric"
    ? [
      { label: "Metric", value: impact.metric },
      { label: "Current value", value: impact.baseline === null ? "Not measured yet" : `${impact.baseline} ${impact.unit}` },
      { label: "Target value", value: `${impact.target} ${impact.unit}` },
    ]
    : [{ label: "Success criterion", value: impact.result }]

  return <section id={id} aria-label={id ? undefined : "Expected impact"} aria-labelledby={id ? `${id}-heading` : undefined} className="space-y-3">
    <h2 id={id ? `${id}-heading` : undefined} className="text-base font-medium">Expected impact</h2>
    <dl className="grid gap-4 sm:grid-cols-2">
      {[...values,
        ...(impact.guardrail ? [{ label: "Guardrail metric", value: formatGuardrail(impact.guardrail) }] : []),
        ...(impact.source ? [{ label: "Data source", value: impact.source }] : []),
        { label: "Check in", value: `${impact.reviewAfterDays} ${impact.reviewAfterDays === 1 ? "day" : "days"}` },
      ].map(({ label, value }) => <div key={label} className="min-w-0 space-y-1 sm:first:col-span-2">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{value}</dd>
      </div>)}
    </dl>
  </section>
}
