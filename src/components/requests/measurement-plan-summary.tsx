import { measurementAudienceLabel, measurementMetricLabel, measurementPlatformLabel, measurementUnitLabel, type MeasurementPlan } from "@/lib/request-measurement";
const checks = { keyboard: "Keyboard navigation", required: "Required-field validation", recovery: "Network error recovery", "": "Pass/fail check" };
const checkCriteria = {
  keyboard: "Every control is reachable, focus is visible, and the flow described in this Request can be completed using only the keyboard.",
  required: "Submission is blocked when a required field is empty, each missing field is identified, and valid entries allow submission.",
  recovery: "Entered details remain available after a network error, an error is shown, and retry completes the action once without a duplicate.",
  "": "",
};

export function MeasurementPlanSummary({ plan, id }: { plan: MeasurementPlan; id?: string }) {
  const { primary, measurement, guardrails } = plan;
  const unit = measurementUnitLabel(primary.unit);
  const values = primary.key === "check" ? [
    { label: "Check", value: checks[primary.check] },
    { label: "Pass criteria", value: checkCriteria[primary.check] },
  ] : [
    { label: "Metric", value: measurementMetricLabel(primary) },
    { label: "Current value", value: primary.noBaseline ? "No existing data for this new feature" : primary.current === null ? "Required before pickup" : `${primary.current} ${unit}` },
    ...(primary.target === null ? [] : [{ label: "Target after release", value: `${primary.target} ${unit}` }]),
  ];
  return <section id={id} aria-label={id ? undefined : "Measurement plan"} aria-labelledby={id ? `${id}-heading` : undefined} className="space-y-4">
    <h2 id={id ? `${id}-heading` : undefined} className="text-base font-medium">Measurement plan</h2>
    <dl className="grid gap-4 sm:grid-cols-2">
      {[...values,
        { label: "Audience", value: measurementAudienceLabel(measurement) },
        { label: "Platform", value: measurementPlatformLabel(measurement) },
        { label: "Measurement window", value: measurement.exactDates ? `${measurement.startDate} to ${measurement.endDate}` : `${measurement.windowDays} days after release` },
      ].map(({ label, value }) => <div key={label} className="min-w-0 space-y-1">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground tabular-nums">{value}</dd>
      </div>)}
    </dl>
    {guardrails.length > 0 && <section aria-label="Guardrails" className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium">Guardrails</h3>
      <ul className="space-y-3">
        {guardrails.map((guardrail, index) => <li key={index} className="space-y-1 text-sm">
          <p>{measurementMetricLabel(guardrail)}</p>
          <p className="text-muted-foreground tabular-nums">Current value: {guardrail.current === null ? "Required before pickup" : `${guardrail.current} ${measurementUnitLabel(guardrail.unit)}`}. Must stay {guardrail.operator === "at_most" ? "at or below" : "at or above"} {guardrail.limit} {measurementUnitLabel(guardrail.unit)}.</p>
        </li>)}
      </ul>
    </section>}
  </section>;
}
