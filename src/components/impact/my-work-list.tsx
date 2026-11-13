import { plannedDay } from "@/lib/dates"
import Link from "@/components/link"
import type { MyWorkEntry } from "@/lib/impact-read-model"
import type { ResultView } from "@/lib/impact-read-model"
import { BEFORE_RELEASE, beforeReleaseText, changeText, entryKindOf, goalText, resultText } from "@/lib/impact-presenter"
import { formatRequestCode } from "@/lib/request-code"
import { requestDetailHref } from "@/lib/request-workspace"
import { Badge } from "@/components/arc/badge/badge"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import buttonStyles from "@/components/arc/button/button.module.css"
import { NewRequestLink } from "@/components/requests/new-request-link"
import styles from "./my-work-list.module.css"
import { Placeholder } from "@/components/loading/placeholder";

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
  const { form, baselineState, plannedBaseline, actual, change, predictedTarget, unit, window, metric, corrections, evidence } = result
  // A Correction that stated another value is what counts; the Correction itself is listed below.
  const corrected = result.correctedFrom ? " (corrected)" : ""
  const before = beforeReleaseText(result)
  // #282: a pass/fail check's own words are its goal, so it needs no metric line above them.
  const goal = form === "pass_fail" || predictedTarget !== null ? goalText({ form, metric, unit, baseline: plannedBaseline, target: predictedTarget }) : null
  return <div className={styles.result}>
    {form === "numeric" ? <p className={styles.metric}>{metric}</p> : null}
    <dl className={styles.facts}>
      {goal !== null ? <div><dt>Goal</dt><dd>{goal}</dd></div> : null}
      {before !== null ? <div><dt>{BEFORE_RELEASE}</dt><dd>{before}</dd></div> : null}
      {form === "pass_fail" || actual !== null ? <div><dt>Result</dt><dd>{resultText(result)}{corrected}</dd></div> : null}
      {change !== null ? <div><dt>Change</dt><dd>{changeText(change, unit)}</dd></div> : null}
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
      <Link href={requestDetailHref(entry.requestId, "all")} className={styles.row} data-pressable="" data-request-id={entry.requestId}>
        <span className={styles.head}>
          {/* C32: the number and title share a line, and the title wraps beside the number. */}
          <span className={styles.name}>
            <span className={styles.code}>{formatRequestCode(entry.requestNumber)}</span>
            <span className={styles.title}>{entry.title}</span>
          </span>
          <span className={styles.badges}>
            <Badge size="sm">{roleLabel(entry.role, subject)}</Badge>
            <Badge size="sm">{entry.journey}</Badge>
          </span>
        </span>
        <ResultDetail entry={entry} />
        {entry.learned && <span className={styles.learned}><span className={styles.learnedLabel}>What we learned</span> {entry.learned.text}{entry.learned.corrected && " (corrected)"}</span>}
        {entry.followUps.length > 0 && <span className={styles.note}>Follow-up Requests: {entry.followUps.map(followUp => `${formatRequestCode(followUp.requestNumber)} ${followUp.title}`).join(", ")}</span>}
      </Link>
    </li>)}
  </ul>
}

/**
 * The My work tab's content: the viewer's own Requests, or an empty state (#283). Someone who can file gets New Request,
 * which opens the composer; someone who can't, with teammates to choose from, is pointed to Showing.
 */
export function MyWorkTab({ entries, canFile = false, chooseSomeone = false }: { entries: MyWorkEntry[]; canFile?: boolean; chooseSomeone?: boolean }) {
  if (entries.length === 0) return chooseSomeone
    ? <EmptyState title="Choose someone in Showing to see their Requests." description="" className={styles.oneLine} />
    : <EmptyState title="Requests you file or pick up show here." description="" className={styles.oneLine}
      action={canFile ? <NewRequestLink className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>New Request</NewRequestLink> : undefined} />
  return <ImpactEntryList entries={entries} />
}

/** A teammate's list (spec story 12): the same rows, marked by the teammate's role, with no totals. */
export function TeammateWorkList({ name, entries }: { name: string; entries: MyWorkEntry[] }) {
  if (entries.length === 0) return <EmptyState title={`${name} has not requested or picked up any Requests yet`} description="Their Requests show here once they request or pick one up." />
  return <ImpactEntryList entries={entries} subject={name} />
}

export function MyWorkLoading() {
  return <Placeholder label="Loading your Requests" lines={4} />
}
