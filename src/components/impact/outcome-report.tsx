"use client"

import Link from "next/link"
import { useEffect } from "react"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Select } from "@/components/arc/select/select"
import { guardrailComparisonPhrase, type GuardrailOperator } from "@/lib/guardrail-comparison"
import { metricChart } from "@/lib/impact-chart-view"
import { periodLabel, type ImpactPeriod } from "@/lib/impact-period"
import { actualText, baselineLabelOf, changeText, NOTHING_MEASURED, predictedText, totalText, valueText } from "@/lib/impact-presenter"
import { iterationsHref } from "@/lib/same-problem-rules"
import type { CorrectedValue, IterationNote, LearnedLine, OutcomeReport, OutcomeReportEntry, OutcomeReportSection, ReportClosedGroup, ReportGuardrail, ResultLine, ResultView } from "@/lib/impact-read-model"
import { formatRequestCode } from "@/lib/request-code"
import { plannedDay } from "@/lib/dates"
import { requestDetailHref } from "@/lib/request-workspace"
import { parsePeriodKey, periodChoices, periodKey, periodOfKind, type PeriodKind } from "./period-picker"
import { MetricChart } from "./metric-chart"
import { printInLight } from "./print-in-light"
import { QuarterNotes, type QuarterNoteEditorTarget } from "./quarter-notes"
import styles from "./outcome-report.module.css"

// The Outcome report tab (#208): what was Released in a month, quarter or year, and what it did. It words what the
// Impact read model returns (buildOutcomeReport) and computes no counts or totals of its own. Nobody is named,
// grouped or ranked here: the report is by Project and by Metric definition only.

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
]

const results = (count: number) => `${count} ${count === 1 ? "result" : "results"}`

function RequestLink({ requestId, requestNumber, title }: { requestId: string; requestNumber: number; title: string }) {
  return <Link href={requestDetailHref(requestId, "all")} className={styles.request}>
    <span className={styles.code}>{formatRequestCode(requestNumber)}</span> <span className={styles.title}>{title}</span>
  </Link>
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={styles.fact}><dt>{label}</dt><dd>{children}</dd></div>
}

function Corrected({ value }: { value: CorrectedValue }) {
  return <p className={styles.note}>{value.label}: {value.value} <Badge size="sm" tone="warning">Corrected</Badge></p>
}

/** What we learned (#209): the current wording, marked Corrected when a Correction changed it. */
function Learned({ learned }: { learned: LearnedLine | null }) {
  if (!learned) return null
  return <div className={styles.group}>
    <h5 className={styles.subheading}>What we learned</h5>
    <p className={styles.problem}>{learned.text}{learned.corrected && <> <Badge size="sm" tone="warning">Corrected</Badge></>}</p>
  </div>
}

/** #218: its place among the attempts at its problem, linking to the Same problem group on the Request page. */
function Iteration({ requestId, iteration }: { requestId: string; iteration: IterationNote | null }) {
  if (!iteration) return null
  return <p className={styles.note}><Link href={iterationsHref(requestId)}>{iteration.label}<span className="sr-only"> of this problem</span></Link></p>
}

function PeriodPicker({ period, now, onPeriodChange }: { period: ImpactPeriod; now: Date; onPeriodChange?: (period: ImpactPeriod) => void }) {
  const choices = periodChoices(period.kind, now)
  const current = periodKey(period)
  const options = choices.some(choice => choice.key === current) ? choices : [{ key: current, label: periodLabel(period) }, ...choices]
  return <div className={styles.picker}>
    <SegmentedControl label="Report by" value={period.kind} options={KINDS} onValueChange={kind => onPeriodChange?.(periodOfKind(kind as PeriodKind, period, now))} />
    <Select label="Period" value={current} onValueChange={key => { const next = parsePeriodKey(key); if (next) onPeriodChange?.(next) }} options={options.map(choice => ({ value: choice.key, label: choice.label }))} />
  </div>
}

function AtAGlance({ counts }: { counts: OutcomeReport["atAGlance"] }) {
  const facts: [string, number][] = [["Shipped", counts.shipped], ["Measured", counts.measured], ["Still due", counts.stillDue], ["Closed without a result", counts.closedWithoutResult]]
  return <section className={styles.block} aria-labelledby="report-glance-heading">
    <h2 id="report-glance-heading" className={styles.heading}>At a glance</h2>
    <dl className={styles.glance}>
      {facts.map(([label, count]) => <div key={label} className={styles.glanceItem}><dt>{label}</dt><dd>{count}</dd></div>)}
    </dl>
  </section>
}

function TotalLine({ line }: { line: ResultLine }) {
  const chart = metricChart(line)
  return <article className={styles.line} aria-label={`${line.metric}, ${line.unit || "pass or fail"}, ${line.window}`}>
    <h3 className={styles.lineTitle}>{line.metric}</h3>
    <p className={styles.note}>{line.audience} · {line.platform} · {line.window} · {results(line.count)}</p>
    {chart && <MetricChart chart={chart} />}
    {line.summed?.change !== null && line.summed?.change !== undefined && <p className={styles.total}>{totalText(line.summed.change, line.unit, line.changeUnit)} from {results(line.summed.count)}</p>}
    {line.unit === "%" && <p className={styles.note}>Changes are in percentage points. They are never added together or averaged.</p>}
    {line.verdicts && <p className={styles.total}>Verified: {line.verdicts.good} good, {line.verdicts.bad} bad. Counted, not summed.</p>}
    <ul className={styles.lineRequests} aria-label={`Requests counted in ${line.metric}`}>
      {line.results.map(result => <li key={result.requestId}>
        {result.requests.map((request, index) => <span key={request.requestId}>{index > 0 && ", "}<RequestLink {...request} /></span>)}
        {result.correctedFrom && <> <Badge size="sm" tone="warning">Corrected</Badge></>}
      </li>)}
    </ul>
  </article>
}

function Totals({ report }: { report: OutcomeReport }) {
  return <section className={styles.block} aria-labelledby="report-totals-heading">
    <h2 id="report-totals-heading" className={styles.heading}>Totals</h2>
    {report.totals === null
      ? <p className={styles.note}>Totals are shown for quarters and years, not months, so small samples don&apos;t mislead.</p>
      : report.totals.length === 0
        ? <p className={styles.note}>{NOTHING_MEASURED}</p>
        : <>
          <p className={styles.note}>Results add up only when they share a Metric definition, audience and window. A result corrected after closing counts at its corrected value; the Request keeps the original.</p>
          <div className={styles.lines}>{report.totals.map(line => <TotalLine key={JSON.stringify([line.definitionId, line.metric, line.unit, line.audience, line.platform, line.window])} line={line} />)}</div>
        </>}
  </section>
}

function guardrailText(guardrail: Pick<ReportGuardrail, "metric" | "operator" | "limit" | "unit">): string {
  return `${guardrail.metric} ${guardrailComparisonPhrase[guardrail.operator as GuardrailOperator] ?? guardrail.operator} ${valueText(guardrail.limit, guardrail.unit)}`
}

function Guardrails({ guardrails }: { guardrails: ReportGuardrail[] }) {
  if (guardrails.length === 0) return null
  return <div className={styles.group}>
    <h5 className={styles.subheading}>Guardrails</h5>
    <ul className={styles.plain}>{guardrails.map((guardrail, index) => <li key={index}>
      {guardrailText(guardrail)}: {guardrail.actual === null ? "not measured yet" : `measured ${valueText(guardrail.actual, guardrail.unit)}, ${guardrail.held ? "held" : "not held"}`}
    </li>)}</ul>
  </div>
}

/** The result counted, marked Corrected with the value recorded at closing when a Correction stated another one. */
function ActualResult({ result }: { result: ResultView }) {
  const original = result.correctedFrom
  return <>{actualText(result)}{original && <> <Badge size="sm" tone="warning">Corrected</Badge> ({actualText({ ...result, ...original })} at closing)</>}</>
}

function MeasuredFacts({ result }: { result: ResultView }) {
  if (result.form === "pass_fail") return <Fact label="Result"><ActualResult result={result} /></Fact>
  return <>
    {result.baselineSource !== null && result.baseline !== null && <Fact label={baselineLabelOf(result.baselineSource)}>{valueText(result.baseline, result.unit)}</Fact>}
    {result.baselineState === "unknown" && <Fact label="Baseline">Unknown</Fact>}
    {result.baselineState === "new_capability" && <Fact label="Baseline">New capability, no change</Fact>}
    <Fact label="Actual"><ActualResult result={result} /></Fact>
    {result.change !== null && <Fact label="Change">{changeText(result.change, result.unit, result.changeUnit)}</Fact>}
  </>
}

function ReportRequest({ entry }: { entry: OutcomeReportEntry }) {
  const headingId = `report-request-${entry.requestId}`
  const { outcome, predicted } = entry
  return <li className={styles.entry}>
    <article aria-labelledby={headingId} className={styles.article}>
      <h4 id={headingId} className={styles.entryHead}><RequestLink {...entry} /> <Badge size="sm">{entry.journey}</Badge></h4>
      <Iteration requestId={entry.requestId} iteration={entry.iteration} />
      <p className={styles.problem}>{entry.problem}</p>
      <dl className={styles.facts}>
        <Fact label="Released"><time dateTime={entry.releaseDate}>{plannedDay(entry.releaseDate)}</time></Fact>
        {predicted && <Fact label="Metric">{predicted.metric}{predicted.form === "numeric" ? ` (${predicted.audience}, ${predicted.window})` : ""}</Fact>}
        {predicted && predicted.form === "numeric" && <Fact label="Predicted">{predictedText(predicted)}</Fact>}
        {outcome.kind === "measured" && <MeasuredFacts result={outcome.result} />}
        {outcome.kind === "still_due" && <Fact label="Result due"><time dateTime={outcome.dueDate}>{plannedDay(outcome.dueDate)}</time> ({outcome.dueLabel})</Fact>}
        {outcome.kind === "operational" && <Fact label="Not measured">Operational work: {outcome.reason}</Fact>}
      </dl>
      {entry.corrected.map(value => <Corrected key={value.field} value={value} />)}
      <Learned learned={entry.learned} />
      <Guardrails guardrails={entry.guardrails} />
      {entry.followUps.length > 0 && <div className={styles.group}>
        <h5 className={styles.subheading}>Follow-up Requests</h5>
        <ul className={styles.plain}>{entry.followUps.map(followUp => <li key={followUp.requestId}><RequestLink {...followUp} /></li>)}</ul>
      </div>}
    </article>
  </li>
}

function ProjectSection({ section }: { section: OutcomeReportSection }) {
  const headingId = `report-project-${section.projectId ?? "none"}`
  return <section className={styles.project} aria-labelledby={headingId}>
    <h3 id={headingId} className={styles.projectHeading}>{section.name}</h3>
    <ul className={styles.entries}>{section.requests.map(entry => <ReportRequest key={entry.requestId} entry={entry} />)}</ul>
  </section>
}

function ClosedWithoutResult({ groups }: { groups: ReportClosedGroup[] }) {
  return <section className={styles.block} aria-labelledby="report-closed-heading">
    <h2 id="report-closed-heading" className={styles.heading}>Closed without a result</h2>
    {groups.length === 0 ? <p className={styles.note}>None this period.</p> : <>
      <p className={styles.note}>Closed without a measured result: Released in this period, or closed in it before any release. Not in any total.</p>
      {groups.map(group => <section key={group.reasonCode} className={styles.project} aria-labelledby={`report-closed-${group.reasonCode}`}>
        <h3 id={`report-closed-${group.reasonCode}`} className={styles.projectHeading}>{group.label} <span className={styles.count}>{group.requests.length}</span></h3>
        <ul className={styles.entries}>{group.requests.map(item => <li key={item.requestId} className={styles.entry}>
          <p className={styles.entryHead}><RequestLink {...item} /></p>
          <Iteration requestId={item.requestId} iteration={item.iteration} />
          <p className={styles.problem}>{item.problem}</p>
          <dl className={styles.facts}>
            <Fact label="Project">{item.projectName ?? "No Project"}</Fact>
            {item.releaseDate
              ? <Fact label="Released"><time dateTime={item.releaseDate}>{plannedDay(item.releaseDate)}</time></Fact>
              : <Fact label="Closed before any release"><time dateTime={item.closedOn}>{plannedDay(item.closedOn)}</time></Fact>}
            {item.reason && <Fact label="Reason">{item.reason}</Fact>}
          </dl>
          {item.corrected.map(value => <Corrected key={value.field} value={value} />)}
          <Learned learned={item.learned} />
        </li>)}</ul>
      </section>)}
    </>}
  </section>
}

/**
 * The report as a reader sees it. `quarterNoteEditor` is set only for an Admin (the page decides from the session);
 * the server refuses anyone else's Quarter note edits anyway. Printing or saving as PDF keeps the report, its period
 * and the as-of date, and leaves out the controls (outcome-report.module.css).
 */
export function OutcomeReportView({ report, onPeriodChange, quarterNoteEditor = null }: { report: OutcomeReport; onPeriodChange?: (period: ImpactPeriod) => void; quarterNoteEditor?: QuarterNoteEditorTarget }) {
  const now = new Date(`${report.asOf}T00:00:00.000Z`)
  // Paper is light: a dark theme prints as light while the print dialog is open.
  useEffect(() => printInLight(window), [])
  return <div className={styles.report}>
    <header className={styles.toolbar}>
      <p className={styles.printTitle} aria-hidden="true">Outcome report</p>
      <div className={styles.toolbarRow}>
        <PeriodPicker period={report.period} now={now} onPeriodChange={onPeriodChange} />
        <div className={styles.print}><Button variant="secondary" size="sm" onClick={() => window.print()}>Print or save as PDF</Button></div>
      </div>
      <p className={styles.asOf} data-report-as-of>
        <span className={styles.periodName}>{periodLabel(report.period)}</span> · Up to date as of <time dateTime={report.asOf}>{plannedDay(report.asOf)}</time>. Work appears in the period it was Released.
      </p>
    </header>

    {report.emptyMessage
      ? <EmptyState title={report.emptyMessage} description="Requests show here once their release is recorded in this period. Pick another month, quarter or year to see more." />
      : <>
        <AtAGlance counts={report.atAGlance} />
        <Totals report={report} />
        {report.projects.length > 0 && <section className={styles.block} aria-labelledby="report-projects-heading">
          <h2 id="report-projects-heading" className={styles.heading}>By Project</h2>
          {report.projects.map(section => <ProjectSection key={section.projectId ?? "none"} section={section} />)}
        </section>}
        <ClosedWithoutResult groups={report.closedWithoutResult} />
      </>}
    <QuarterNotes slots={report.quarterNotes} editor={quarterNoteEditor} asOf={report.asOf} />
  </div>
}
