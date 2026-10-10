import type { ExpectedImpact } from "@/lib/request-impact"

export function ExpectedImpactSummary({ impact }: { impact: ExpectedImpact }) {
  const values = impact.kind === "metric"
    ? [
      { label: "Metric", value: impact.metric },
      { label: "Current value", value: impact.baseline === null ? "Not measured yet" : `${impact.baseline} ${impact.unit}` },
      { label: "Target value", value: `${impact.target} ${impact.unit}` },
    ]
    : [{ label: "Success criterion", value: impact.result }]

  return <section aria-label="Expected impact" className="space-y-3">
    <h2 className="text-base font-medium">Expected impact</h2>
    <dl className="grid gap-4 sm:grid-cols-2">
      {[...values,
        { label: "Data source", value: impact.source },
        { label: "Measure after launch", value: `${impact.reviewAfterDays} ${impact.reviewAfterDays === 1 ? "day" : "days"} after launch` },
      ].map(({ label, value }) => <div key={label} className="min-w-0 space-y-1 sm:first:col-span-2">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{value}</dd>
      </div>)}
    </dl>
  </section>
}
