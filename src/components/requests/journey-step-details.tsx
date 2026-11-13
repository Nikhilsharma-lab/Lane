import type { ReactNode } from "react"
import { guardrailComparisonPhrase } from "@/lib/guardrail-comparison"
import { CORRECTION_FIELD_OPTIONS } from "@/lib/request-outcome-options"
// The forms load with their popups (#277); the details need only the value words.
import { resultValue } from "./result-value"
import { goalValueText, passFailText, resultAgainstGoal, resultValueText } from "@/lib/result-phrasing"
import { DUE_DATE_LINE, evidenceLine, fixedWindowLine, learnedLine, observedLine, type TimelineStep } from "./request-timeline-model"
import { LocalTime } from "./local-time"
import { SectionHeading } from "./section-heading"
import type { Views } from "./request-timeline"
import styles from "./request-timeline.module.css"

/** A finished or current step's facts: the reviews in Open, the release in Measuring, the result and its corrections in
 * Closed. A function, not a component, like `stepItem`: the reviews, drawn in the outline, keep their place in the tree. */
export function journeyStepDetails(step: TimelineStep, { views: { release, outcome }, reviews, name }: { views: Views; reviews: ReactNode; name: (id: string) => string }) {
  const closure = outcome.closure
  const agreed = outcome.agreed
  if (step.state !== "finished" && step.state !== "current") return null
  if (step.status === "open") return reviews
  if (step.status === "measuring") {
    const fact = release.release ?? closure?.release
    if (!fact) return null
    return <div className={styles.facts}>
      <p className={styles.muted}>{evidenceLine(fact.evidence)}</p>
      {release.recordedValueBefore && <p className={styles.muted}>Value before release: {resultValue(release.recordedValueBefore.value, release.recordedValueBefore.unit)}.</p>}
      {fact.windowKind === "fixed" && <p className={styles.muted}>{fixedWindowLine(fact)}</p>}
      {step.state === "current" && <p className={styles.muted}>{DUE_DATE_LINE}</p>}
    </div>
  }
  if (step.status !== "closed" || !closure) return null
  return <div className={styles.facts}>
    {agreed && closure.kind === "measured" && <dl className={styles.facts}>
      {/* #279: the goal in its own words, and the result against it in the goal's direction (result-phrasing.ts). */}
      <div><dt>Goal</dt><dd>{agreed.label}{agreed.form === "numeric" && `: ${goalValueText(agreed)}`}</dd></div>
      <div><dt>Result</dt><dd>{closure.primary.kind === "numeric" ? resultAgainstGoal(closure.primary.actual, { unit: closure.primary.unit, baseline: agreed.baseline, target: agreed.target }) : passFailText(closure.primary.passed)}</dd></div>
      {closure.guardrails.map((g, i) => <div key={i}><dt>Guardrail: {g.metric}</dt><dd>Stays {guardrailComparisonPhrase[g.operator]} {resultValue(g.limit, g.unit)} · Actual {resultValue(g.actual, g.unit)} · {g.held ? "Held" : "Breached"}</dd></div>)}
    </dl>}
    {closure.kind === "measured" && <>
      <p>{evidenceLine(closure.evidence)}</p>
      <p className={styles.muted}>{observedLine(closure)}</p>
    </>}
    {closure.kind === "exception" && closure.reason && <p>{closure.reason}</p>}
    {/* #209: the line as given at closing; a Correction below shows any new wording beside it. */}
    {closure.learned && <p>{learnedLine(closure.learned)}</p>}
    {!!outcome.corrections.length && <div className={styles.facts}><SectionHeading level={4}>Corrections</SectionHeading><ol className={styles.list}>{outcome.corrections.map(c => <li key={c.operationId}>
      <p>{CORRECTION_FIELD_OPTIONS.find(o => o.value === c.field)?.label}: {c.value && <>{c.value.kind === "numeric" ? resultValueText(c.value.actual, closure.kind === "measured" && closure.primary.kind === "numeric" ? closure.primary.unit : "") : passFailText(c.value.passed)}. </>}{c.correction}</p>
      <p className={styles.muted}>Reason: {c.reason}. Added by {name(c.actorId)} on <LocalTime iso={c.at} day />.</p>
    </li>)}</ol></div>}
  </div>
}
