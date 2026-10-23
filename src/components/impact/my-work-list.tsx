import Link from "next/link"
import type { MyWorkEntry } from "@/lib/impact-read-model"
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

/** Values carry their unit; a percentage is a percentage, a count is a bare number. */
function valueText(value: number, unit: string): string {
  return unit === "%" ? `${value}%` : unit === "count" ? `${value}` : `${value} ${unit}`
}

function changeText(change: number, changeUnit: string): string {
  const sign = change > 0 ? "+" : ""
  return changeUnit === "count" ? `${sign}${change}` : `${sign}${change} ${changeUnit}`
}

function ResultDetail({ entry }: { entry: MyWorkEntry }) {
  const { result, predicted } = entry
  if (result) {
    const { baselineState, baseline, actual, change, verdict, predictedTarget, predictedChange, unit, changeUnit, window, metric, corrections } = result
    return <div className={styles.result}>
      <p className={styles.metric}>{metric}</p>
      <dl className={styles.facts}>
        {result.form === "pass_fail" ? <div><dt>Result</dt><dd>{verdict === "good" ? "Passed" : "Did not pass"}</dd></div> : null}
        {result.form === "numeric" && baselineState === "known" && baseline !== null ? <div><dt>Baseline</dt><dd>{valueText(baseline, unit)}</dd></div> : null}
        {result.form === "numeric" && actual !== null ? <div><dt>Actual</dt><dd>{valueText(actual, unit)}</dd></div> : null}
        {change !== null && changeUnit !== null ? <div><dt>Change</dt><dd>{changeText(change, changeUnit)}</dd></div> : null}
        {predictedChange !== null && changeUnit !== null ? <div><dt>Predicted change</dt><dd>{changeText(predictedChange, changeUnit)}</dd></div> : null}
        {predictedTarget !== null && result.form === "numeric" ? <div><dt>Predicted</dt><dd>{valueText(predictedTarget, unit)}</dd></div> : null}
        <div><dt>Window</dt><dd>{window}</dd></div>
      </dl>
      {baselineState === "unknown" ? <p className={styles.note}>Baseline unknown</p> : null}
      {baselineState === "new_capability" ? <p className={styles.note}>New capability. Target only, no change.</p> : null}
      {corrections.map(correction => <p key={`${correction.field}-${correction.at}`} className={styles.note}>Correction to {correction.field}: {correction.correction}. Reason: {correction.reason}</p>)}
    </div>
  }
  if (entry.stillDue) {
    return <div className={styles.result}>
      <p className={styles.metric}>{entry.stillDue.metric}</p>
      <dl className={styles.facts}>
        <div><dt>Still due</dt><dd>Due {entry.stillDue.dueDate} ({entry.stillDue.dueLabel})</dd></div>
      </dl>
    </div>
  }
  if (entry.closedWithoutResult) return <p className={styles.note}>Closed without a result: {entry.closedWithoutResult.reason}</p>
  if (entry.operationalReason) return <p className={styles.note}>Operational work: {entry.operationalReason}</p>
  if (predicted) return <div className={styles.result}><p className={styles.metric}>{predicted.metric}</p><p className={styles.note}>Predicted, not measured yet</p></div>
  return null
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
      </Link>
    </li>)}
  </ul>
}

/** The My work tab's content: the viewer's own Requests, or an empty state. */
export function MyWorkTab({ entries }: { entries: MyWorkEntry[] }) {
  if (entries.length === 0) return <EmptyState title="Nothing requested or picked up yet" description="Requests you request or pick up show here, with their predicted and actual results." />
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
