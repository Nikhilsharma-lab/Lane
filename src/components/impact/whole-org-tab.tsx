"use client"

import type { ImpactPeriod, OrgView, ResultLine, ResultView } from "@/lib/impact-read-model"
import { Select } from "@/components/arc/select/select"
import { parsePeriodKey, periodChoices, periodKey, periodLabel } from "./impact-period"
import styles from "./whole-org-tab.module.css"

// The Whole org tab (#157). It renders the read model's OrgView and computes no totals of its own: every number
// shown here is one the read model returned. Guests get no OrgView, so this tab renders nothing for them.

const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`

function baselineText(result: ResultView): string {
  if (result.baselineState === "known") return `Baseline ${result.baseline} ${result.unit}`
  if (result.baselineState === "new_capability") return `New capability, target ${result.predictedTarget ?? "not set"} ${result.unit}, no change`
  if (result.baselineState === "unknown") return "Baseline unknown"
  return ""
}

function ResultDetail({ result }: { result: ResultView }) {
  const sharedWith = result.requests.filter(request => request.requestId !== result.requestId)
  return <li className={styles.result}>
    <p className={styles.resultTitle}>Request #{result.requestNumber} {result.title}</p>
    <p className={styles.resultFacts}>
      {result.form === "pass_fail"
        ? <span>{result.verdict === "good" ? "Good" : result.verdict === "bad" ? "Bad" : "No verdict"}</span>
        : <>
          {baselineText(result) && <span>{baselineText(result)}</span>}
          {result.actual !== null && <span>Actual {result.actual} {result.unit}</span>}
          {result.change !== null && result.changeUnit && <span>Change {signed(result.change)} {result.changeUnit}</span>}
          {result.predictedChange !== null && result.changeUnit && <span>Predicted {signed(result.predictedChange)} {result.changeUnit}</span>}
        </>}
      <span>Window: {result.window}</span>
    </p>
    {result.corrections.map(correction => <p key={`${correction.field}-${correction.at}`} className={styles.note}>Corrected {correction.field}: {correction.correction} ({correction.reason})</p>)}
    {sharedWith.length > 0 && <p className={styles.note}>Counted once, shared with {sharedWith.map(request => `Request #${request.requestNumber}`).join(", ")}</p>}
  </li>
}

function MeasuredLine({ line }: { line: ResultLine }) {
  return <article className={styles.line} aria-label={`${line.metric}, ${line.unit}, ${line.window}`}>
    <header className={styles.lineHead}>
      <h3 className={styles.lineTitle}>{line.metric}</h3>
      <p className={styles.lineMeta}>Unit: {line.unit} · Window: {line.window} · {line.count} {line.count === 1 ? "result" : "results"}</p>
    </header>
    {line.summed?.change !== null && line.summed?.change !== undefined && <p className={styles.total}>Total change {signed(line.summed.change)} {line.changeUnit ?? line.unit} from {line.summed.count} {line.summed.count === 1 ? "result" : "results"}</p>}
    {line.unit === "%" && <p className={styles.note}>Changes are in percentage points. They are never added together or averaged.</p>}
    {line.verdicts && <p className={styles.total}>Verified: {line.verdicts.good} good, {line.verdicts.neutral} neutral, {line.verdicts.bad} bad. Counted, not summed.</p>}
    <ul className={styles.results}>{line.results.map(result => <ResultDetail key={`${result.requestId}-${result.requestNumber}`} result={result} />)}</ul>
  </article>
}

export function WholeOrgTab({ view, period, year = new Date().getUTCFullYear(), onPeriodChange }: {
  view: OrgView | null; period: ImpactPeriod | null; year?: number; onPeriodChange?: (period: ImpactPeriod | null) => void;
}) {
  if (!view) return null
  const choices = periodChoices(year)
  const current = periodKey(period)
  const options = choices.some(choice => choice.key === current) ? choices : [{ key: current, label: periodLabel(period), period }, ...choices]

  return <section className={styles.tab} aria-label="Whole org impact">
    <div className={styles.toolbar}>
      <Select label="Period" value={current} onValueChange={key => onPeriodChange?.(parsePeriodKey(key))} options={options.map(choice => ({ value: choice.key, label: choice.label }))} />
      <p className={styles.lineMeta}>Grouped by release date. Showing {periodLabel(view.period)}.</p>
    </div>

    <section className={styles.block} data-section="measured" aria-labelledby="org-measured-heading">
      <h2 id="org-measured-heading" className={styles.heading}>Measured results</h2>
      {view.lines.length === 0
        ? <p className={styles.empty}>{view.emptyMessage ?? "Nothing measured this period yet"}</p>
        : view.lines.map(line => <MeasuredLine key={`${line.metric}|${line.unit}|${line.audience}|${line.platform}|${line.window}`} line={line} />)}
    </section>

    <section className={styles.block} data-section="operational" aria-labelledby="org-operational-heading">
      <h2 id="org-operational-heading" className={styles.heading}>Operational work</h2>
      <p className={styles.note}>Not measured and not in any total.</p>
      {view.operational.length === 0 ? <p className={styles.empty}>No operational work.</p> : <ul className={styles.list}>
        {view.operational.map(item => <li key={item.requestId}>Request #{item.requestNumber} {item.title}{item.projectName ? ` · ${item.projectName}` : ""}: {item.reason}</li>)}
      </ul>}
    </section>

    <section className={styles.block} data-section="closed-without-result" aria-labelledby="org-closed-heading">
      <h2 id="org-closed-heading" className={styles.heading}>Closed without a result</h2>
      <p className={styles.note}>Not in any total. Shown with the reason it was closed.</p>
      {view.closedWithoutResult.length === 0 ? <p className={styles.empty}>None.</p> : <ul className={styles.list}>
        {view.closedWithoutResult.map(item => <li key={item.requestId}>Request #{item.requestNumber} {item.title}{item.projectName ? ` · ${item.projectName}` : ""}: {item.reason}</li>)}
      </ul>}
    </section>

    <section className={styles.block} data-section="timeline" aria-labelledby="org-timeline-heading">
      <h2 id="org-timeline-heading" className={styles.heading}>Still due</h2>
      <p className={styles.note}>Placed by due date. Results are not shown until they are recorded.</p>
      {view.timeline.length === 0 ? <p className={styles.empty}>Nothing is waiting to be measured.</p> : <ol className={styles.list}>
        {view.timeline.map(item => <li key={item.requestId}><time dateTime={item.dueDate}>{item.dueDate}</time> Request #{item.requestNumber} {item.title} · {item.metric} · {item.dueLabel}</li>)}
      </ol>}
    </section>

    {view.unreleased.length > 0 && <section className={styles.block} data-section="unreleased" aria-labelledby="org-unreleased-heading">
      <h2 id="org-unreleased-heading" className={styles.heading}>No release date</h2>
      <p className={styles.note}>Not counted in any quarter or year until a release date is recorded.</p>
      <ul className={styles.list}>{view.unreleased.map(item => <li key={item.requestId}>Request #{item.requestNumber} {item.title}</li>)}</ul>
    </section>}

    <section className={styles.block} data-section="projects" aria-labelledby="org-projects-heading">
      <h2 id="org-projects-heading" className={styles.heading}>Requests by Project</h2>
      <p className={styles.note}>Secondary: counts of where each Request sits, not results.</p>
      <ul className={styles.list}>{view.projectStacks.map(stack => <li key={stack.projectId ?? "none"}>
        {stack.name}: {Object.entries(stack.counts).map(([label, count]) => `${label} ${count}`).join(" · ") || "No Requests"}
      </li>)}</ul>
    </section>
  </section>
}
