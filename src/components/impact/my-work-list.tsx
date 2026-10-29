import { plannedDay } from "@/lib/dates"
import Link from "next/link"
import type { MyWorkEntry } from "@/lib/impact-read-model"
import type { ResultView } from "@/lib/impact-read-model"
import { actualText, baselineLabelOf, changeText, entryKindOf, goalText, valueText } from "@/lib/impact-presenter"
import { formatRequestCode } from "@/lib/request-code"
import { requestDetailHref } from "@/lib/request-workspace"
import { Badge } from "@/components/arc/badge/badge"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import styles from "./my-work-list.module.css"

// The My work tab's rows (#155), also used for a teammate's list (spec story 12). This file renders what the
// impact read model returns and computes no totals, averages, scores or rankings of its own.

/** "Requested by you", "Picked up by you", or the same with a teammate's name. */
function roleLabel(role: MyWorkEntry["role"], subject: string | undefined): string {
  const by = subject ?? "you"
  return role === "both" ? `Requested and picked up by ${by}` : role === "requester" ? `Requested by ${by}` : `Picked up by ${by}`
}

function ResultDetail({ entry }: { entry: MyWorkEntry }) {
  const kind = entryKindOf(entry)
  switch (kind.kind) {
    case "result": return <MeasuredFacts result={kind.result} />
    case "still_due": return <div className={styles.result}>
      <p className={styles.metric}>{kind.due.metric}</p>
      <dl className={styles.facts}>
        <div><dt>Still due</dt><dd>Due {plannedDay(kind.due.dueDate)} ({kind.due.dueLabel})</dd></div>
      </dl>
    </div>
    case "closed_without_result": return <p className={styles.note}>Closed without a result: {kind.reason}</p>
    case "operational": return <p className={styles.note}>Operational work: {kind.reason}</p>
    case "predicted": return <div className={styles.result}><p className={styles.metric}>{kind.predicted.metric}</p><p className={styles.note}>Goal set, not measured yet</p></div>
    default: return null
  }
}

function MeasuredFacts({ result }: { result: ResultView }) {
  const { baselineState, baselineSource, baseline, plannedBaseline, actual, change, predictedTarget, unit, changeUnit, window, metric, corrections, evidence } = result
  // A Correction that stated another value is what counts; the Correction itself is listed below.
  const corrected = result.correctedFrom ? " (corrected)" : ""
  return <div className={styles.result}>
    <p className={styles.metric}>{metric}</p>
    <dl className={styles.facts}>
      {result.form === "pass_fail" ? <div><dt>Result</dt><dd>{actualText(result)}{corrected}</dd></div> : null}
      {result.form === "numeric" && baselineSource !== null && baseline !== null ? <div><dt>{baselineLabelOf(baselineSource)}</dt><dd>{valueText(baseline, unit)}</dd></div> : null}
      {result.form === "numeric" && actual !== null ? <div><dt>Actual</dt><dd>{valueText(actual, unit)}{corrected}</dd></div> : null}
      {change !== null && changeUnit !== null ? <div><dt>Change</dt><dd>{changeText(change, unit, changeUnit)}</dd></div> : null}
      {predictedTarget !== null && result.form === "numeric" ? <div><dt>Goal</dt><dd>{goalText({ form: result.form, metric, unit, baseline: plannedBaseline, target: predictedTarget })}</dd></div> : null}
      <div><dt>Window</dt><dd>{window}</dd></div>
      {evidence ? <div><dt>Evidence</dt><dd>{evidence}</dd></div> : null}
    </dl>
    {baselineState === "unknown" ? <p className={styles.note}>Baseline unknown</p> : null}
    {baselineState === "new_capability" ? <p className={styles.note}>New capability. Goal only, no change.</p> : null}
    {corrections.map(correction => <p key={`${correction.field}-${correction.at}`} className={styles.note}>Correction to {correction.field}: {correction.correction}. Reason: {correction.reason}</p>)}
  </div>
}

/** One row per Request. The whole row is a link to the Request detail, so it opens from the keyboard. */
export function ImpactEntryList({ entries, subject }: { entries: MyWorkEntry[]; subject?: string }) {
  return <ul className={styles.list}>
    {entries.map(entry => <li key={entry.requestId} className={styles.item}>
      <Link href={requestDetailHref(entry.requestId, "all")} className={styles.row} data-request-id={entry.requestId}>
        <span className={styles.head}>
          <span className={styles.code}>{formatRequestCode(entry.requestNumber)}</span>
          <span className={styles.title}>{entry.title}</span>
          <Badge size="sm">{roleLabel(entry.role, subject)}</Badge>
          <Badge size="sm">{entry.journey}</Badge>
        </span>
        <ResultDetail entry={entry} />
        {entry.followUps.length > 0 && <span className={styles.note}>Follow-up Requests: {entry.followUps.map(followUp => `${formatRequestCode(followUp.requestNumber)} ${followUp.title}`).join(", ")}</span>}
      </Link>
    </li>)}
  </ul>
}

/** The My work tab's content: the viewer's own Requests, or an empty state. */
export function MyWorkTab({ entries }: { entries: MyWorkEntry[] }) {
  if (entries.length === 0) return <EmptyState title="Nothing requested or picked up yet" description="Requests you request or pick up show here, with their goals and results." />
  return <ImpactEntryList entries={entries} />
}

/** A teammate's list (spec story 12): the same rows, marked by the teammate's role, with no totals. */
export function TeammateWorkList({ name, entries }: { name: string; entries: MyWorkEntry[] }) {
  if (entries.length === 0) return <EmptyState title={`${name} has not requested or picked up any Requests yet`} description="Their Requests show here once they request or pick one up." />
  return <ImpactEntryList entries={entries} subject={name} />
}

export function MyWorkLoading() {
  return <Skeleton label="Loading your Requests" lines={4} />
}
