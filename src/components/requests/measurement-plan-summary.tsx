import { plannedDay } from "@/lib/dates";
import { GUARDRAIL_COMPARISONS } from "@/lib/guardrail-comparison";
import { goalText } from "@/lib/impact-presenter";
import { measurementAudienceLabel, measurementMetricLabel, measurementPlatformLabel, measurementUnitLabel, type MeasurementPlan } from "@/lib/request-measurement";
import styles from "./measurement-plan-summary.module.css";
import { passFailDetails } from "@/lib/pass-fail-check";
import { SectionHeading } from "./section-heading";

/** A Request's Goal section (#261). `metricNames`: each Metric definition's current name by reference (#198). Without one, the name copied when the goal was set shows. */
export function MeasurementPlanSummary({ plan, id, metricNames }: { plan: MeasurementPlan; id?: string; metricNames?: Record<string, string> }) {
  const { primary, measurement, guardrails } = plan;
  const check = passFailDetails(primary);
  const metricName = (metric: MeasurementPlan["primary"] | MeasurementPlan["guardrails"][number]) =>
    (metric.key === "definition" && metric.definitionId && metricNames?.[metric.definitionId]) || measurementMetricLabel(metric);
  const unit = measurementUnitLabel(primary.unit);
  const unitSeparator = primary.unit === "percent" ? "" : " ";
  const currentIsText = primary.noBaseline || primary.current === null;
  // The goal reads as its end value with where it starts ("80% (from 62%)"); a start not yet known stays its own line.
  const goal = primary.target === null ? null : goalText({ form: "numeric", metric: metricName(primary), unit, baseline: currentIsText ? null : primary.current, target: primary.target });

  return <section id={id} aria-label={id ? undefined : "Goal"} aria-labelledby={id ? `${id}-heading` : undefined} className={styles.summary}>
    <SectionHeading level={2} id={id ? `${id}-heading` : undefined} className={styles.heading}>Goal</SectionHeading>
    {primary.key === "check" ? <dl className={styles.check}>
      <div className={styles.field}>
        <dt className={styles.label}>Goal</dt>
        <dd className={styles.metric}>{check.result}</dd>
      </div>
      <div className={styles.field}>
        <dt className={styles.label}>How to check</dt>
        <dd className={styles.description}>{check.steps}</dd>
      </div>
      <div className={styles.field}>
        <dt className={styles.label}>It passes when</dt>
        <dd className={styles.description}>{check.pass}</dd>
      </div>
    </dl> : <div className={styles.metricGroup}>
      <SectionHeading level={3} className={styles.metric}>{metricName(primary)}</SectionHeading>
      <dl className={styles.values}>
        {(!goal || currentIsText) && <div className={styles.field}>
          <dt className={styles.label}>Current</dt>
          <dd className={currentIsText ? styles.description : styles.value}>
            {primary.noBaseline ? "No existing data for this new feature" : primary.current === null ? "Required before pickup" : `${primary.current}${unitSeparator}${unit}`}
          </dd>
        </div>}
        {goal && <div className={styles.field}>
          <dt className={styles.label}>Goal</dt>
          <dd className={styles.value}>{goal}</dd>
        </div>}
      </dl>
    </div>}
    <dl className={styles.context}>
      {[
        { label: "Audience", value: measurementAudienceLabel(measurement) },
        { label: "Platform", value: measurementPlatformLabel(measurement) },
        { label: "Measurement window", value: measurement.exactDates ? `${plannedDay(measurement.startDate)} to ${plannedDay(measurement.endDate)}` : `${measurement.windowDays} days after release` },
      ].map(({ label, value }) => <div key={label} className={styles.contextItem}>
        <dt className={styles.label}>{label}</dt>
        <dd className={styles.contextValue}>{value}</dd>
      </div>)}
    </dl>
    {guardrails.length > 0 && <section aria-label="Guardrails" className={styles.guardrails}>
      <SectionHeading level={3} className={styles.metric}>Guardrails</SectionHeading>
      <ul className={styles.guardrailList}>
        {guardrails.map((guardrail, index) => {
          const guardrailUnit = `${guardrail.unit === "percent" ? "" : " "}${measurementUnitLabel(guardrail.unit)}`;
          return <li key={index} className={styles.metricGroup}>
            <SectionHeading level={4} className={styles.metric}>{metricName(guardrail)}</SectionHeading>
            <dl className={styles.values}>
              <div className={styles.field}>
                <dt className={styles.label}>{GUARDRAIL_COMPARISONS.find(option => option.value === guardrail.operator)?.label}</dt>
                <dd className={styles.value}>{`${guardrail.limit}${guardrailUnit}`}</dd>
              </div>
            </dl>
          </li>;
        })}
      </ul>
    </section>}
  </section>;
}
