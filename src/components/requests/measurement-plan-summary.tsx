import { measurementAudienceLabel, measurementMetricLabel, measurementPlatformLabel, measurementUnitLabel, type MeasurementPlan } from "@/lib/request-measurement";
import styles from "./measurement-plan-summary.module.css";

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
  const unitSeparator = primary.unit === "percent" ? "" : " ";
  const currentIsText = primary.noBaseline || primary.current === null;

  return <section id={id} aria-label={id ? undefined : "Measurement plan"} aria-labelledby={id ? `${id}-heading` : undefined} className={styles.summary}>
    <h2 id={id ? `${id}-heading` : undefined} className={styles.heading}>Measurement plan</h2>
    {primary.key === "check" ? <dl className={styles.check}>
      <div className={styles.field}>
        <dt className={styles.label}>Check</dt>
        <dd className={styles.metric}>{checks[primary.check]}</dd>
      </div>
      <div className={styles.field}>
        <dt className={styles.label}>Pass criteria</dt>
        <dd className={styles.description}>{checkCriteria[primary.check]}</dd>
      </div>
    </dl> : <div className={styles.metricGroup}>
      <h3 className={styles.metric}>{measurementMetricLabel(primary)}</h3>
      <dl className={styles.values}>
        <div className={styles.field}>
          <dt className={styles.label}>Current</dt>
          <dd className={currentIsText ? styles.description : styles.value}>
            {primary.noBaseline ? "No existing data for this new feature" : primary.current === null ? "Required before pickup" : `${primary.current}${unitSeparator}${unit}`}
          </dd>
        </div>
        {primary.target !== null && <div className={styles.field}>
          <dt className={styles.label}>Target after release</dt>
          <dd className={styles.value}>{`${primary.target}${unitSeparator}${unit}`}</dd>
        </div>}
      </dl>
    </div>}
    <dl className={styles.context}>
      {[
        { label: "Audience", value: measurementAudienceLabel(measurement) },
        { label: "Platform", value: measurementPlatformLabel(measurement) },
        { label: "Measurement window", value: measurement.exactDates ? `${measurement.startDate} to ${measurement.endDate}` : `${measurement.windowDays} days after release` },
      ].map(({ label, value }) => <div key={label} className={styles.contextItem}>
        <dt className={styles.label}>{label}</dt>
        <dd className={styles.contextValue}>{value}</dd>
      </div>)}
    </dl>
    {guardrails.length > 0 && <section aria-label="Guardrails" className={styles.guardrails}>
      <h3 className={styles.metric}>Guardrails</h3>
      <ul className={styles.guardrailList}>
        {guardrails.map((guardrail, index) => {
          const guardrailUnit = `${guardrail.unit === "percent" ? "" : " "}${measurementUnitLabel(guardrail.unit)}`;
          return <li key={index} className={styles.metricGroup}>
            <h4 className={styles.metric}>{measurementMetricLabel(guardrail)}</h4>
            <dl className={styles.values}>
              <div className={styles.field}>
                <dt className={styles.label}>Current</dt>
                <dd className={guardrail.current === null ? styles.description : styles.value}>
                  {guardrail.current === null ? "Required before pickup" : `${guardrail.current}${guardrailUnit}`}
                </dd>
              </div>
              <div className={styles.field}>
                <dt className={styles.label}>{guardrail.operator === "at_most" ? "Maximum" : "Minimum"}</dt>
                <dd className={styles.value}>{`${guardrail.limit}${guardrailUnit}`}</dd>
              </div>
            </dl>
          </li>;
        })}
      </ul>
    </section>}
  </section>;
}
