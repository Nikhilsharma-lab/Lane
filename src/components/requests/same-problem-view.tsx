import type { Ref } from "react"
import Link from "next/link"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { actualText, changeText, predictedText } from "@/lib/impact-presenter"
import type { IterationEntry, Iterations } from "@/lib/impact-read-model"
import { formatRequestCode } from "@/lib/request-code"
import { journeyDate, journeyDay } from "@/lib/request-journey"
import { ITERATIONS_SECTION_ID, type SameProblemHistoryLine } from "@/lib/same-problem-rules"
import styles from "./same-problem.module.css"

export type SameProblemState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; iterations: Iterations | null; history: SameProblemHistoryLine[]; canChange: boolean }

export type SameProblemViewProps = {
  requestNumber: number
  state: SameProblemState
  onOpenLink: () => void
  onRemove: (entry: Pick<IterationEntry, "requestId" | "requestNumber">) => void
  onRetry: () => void
  /** The Request being removed, while it is. */
  removing?: string | null
  /** A refused or failed link change, shown in place. */
  actionError?: string
  /** What just changed, for screen readers. */
  announcement?: string
  linkButtonRef?: Ref<HTMLButtonElement>
  headingRef?: Ref<HTMLHeadingElement>
}

const HEADING_ID = "iterations-heading"

function historyText(line: SameProblemHistoryLine): string {
  const when = `by ${line.actorName} on ${journeyDay(line.at)}.`
  if (line.kind === "linked") return `Linked as Same problem with ${formatRequestCode(line.other!.requestNumber)} ${when}`
  if (line.other) return `Its Same problem group ended when ${formatRequestCode(line.other.requestNumber)} was taken out, ${when}`
  return `Taken out of its Same problem group ${when}`
}

function Outcome({ entry }: { entry: IterationEntry }) {
  const { outcome } = entry
  switch (outcome.kind) {
    case "measured": {
      const { result } = outcome
      return <div><dt>Result</dt><dd>{actualText(result)}{result.change !== null && ` (${changeText(result.change, result.unit, result.changeUnit)})`}</dd></div>
    }
    case "closed_without_result": return <div><dt>Reason</dt><dd>{outcome.label}{outcome.reason && `: ${outcome.reason}`}</dd></div>
    case "operational": return <div><dt>Not measured</dt><dd>Operational work: {outcome.reason}</dd></div>
    case "still_due": return outcome.due
      ? <div><dt>Result due</dt><dd><time dateTime={outcome.due.dueDate}>{journeyDate(outcome.due.dueDate)}</time> ({outcome.due.dueLabel})</dd></div>
      : <div><dt>Result</dt><dd>Not Released yet</dd></div>
  }
}

function Iteration({ entry, canChange, removing, onRemove }: { entry: IterationEntry; canChange: boolean; removing: boolean; onRemove: () => void }) {
  const code = formatRequestCode(entry.requestNumber)
  const name = <><span className={styles.code}>{code}</span> <span className={styles.title}>{entry.title}</span></>
  return <li className={styles.iteration} aria-current={entry.current ? "true" : undefined} data-current={entry.current ? "" : undefined}>
    <div className={styles.head}>
      <span className={styles.number}>{entry.label}</span>
      {entry.current ? <span className={styles.request}>{name} <span className="sr-only">(this Request)</span></span> : <Link href={`/requests/${entry.requestId}`} className={styles.request}>{name}</Link>}
      <Badge size="sm">{entry.journey}</Badge>
    </div>
    <dl className={styles.facts}>
      {entry.predicted && <div><dt>Predicted</dt><dd>{entry.predicted.metric}{entry.predicted.form === "numeric" && `: ${predictedText(entry.predicted)}`}</dd></div>}
      <Outcome entry={entry} />
    </dl>
    {canChange && <div className={styles.actions}>
      <Button variant="ghost" size="sm" loading={removing} disabled={removing} onClick={onRemove} aria-label={`Remove ${code} from this group`}>Remove</Button>
    </div>}
  </li>
}

/**
 * "Iterations of this problem" (#218): the Request's Same problem group, oldest first, each attempt with its status,
 * prediction and result (or reason), the one being read highlighted with its number, and the link history. Admins
 * and Members link and remove; a Viewer reads; a guest never gets here. Follow-ups are listed in the journey, apart.
 */
export function SameProblemView({ requestNumber, state, onOpenLink, onRemove, onRetry, removing = null, actionError, announcement, linkButtonRef, headingRef }: SameProblemViewProps) {
  const heading = <h2 id={HEADING_ID} ref={headingRef} tabIndex={-1} className={styles.heading}>Iterations of this problem</h2>
  if (state.kind === "loading") return <section id={ITERATIONS_SECTION_ID} aria-labelledby={HEADING_ID} className={styles.section}>
    <div className={styles.header}>{heading}</div>
    <p role="status" className={styles.muted}>Loading Iterations…</p>
  </section>
  if (state.kind === "error") return <section id={ITERATIONS_SECTION_ID} aria-labelledby={HEADING_ID} className={styles.section}>
    <div className={styles.header}>{heading}</div>
    <p role="alert" className={styles.muted}>{state.message}</p>
    <div><Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button></div>
  </section>

  const { iterations, history, canChange } = state
  if (!iterations && history.length === 0 && !canChange) return null
  const count = iterations?.iterations.length ?? 0
  return <section id={ITERATIONS_SECTION_ID} aria-labelledby={HEADING_ID} className={styles.section}>
    <div className={styles.header}>
      {heading}
      {count > 0 && <span className={styles.count}>{count}</span>}
      {canChange && <Button ref={linkButtonRef} variant="secondary" size="sm" className={styles.link} onClick={onOpenLink}>Link a Request</Button>}
    </div>
    {iterations
      ? <>
        <p className={styles.muted}>This Request is the {iterations.current.label} of {count}. Requests linked as Same problem, oldest first.</p>
        <ol className={styles.list} aria-label={`Iterations of this problem, ${formatRequestCode(requestNumber)} is the ${iterations.current.label}`}>
          {iterations.iterations.map(entry => <Iteration key={entry.requestId} entry={entry} canChange={canChange} removing={removing === entry.requestId} onRemove={() => onRemove(entry)} />)}
        </ol>
      </>
      : <p className={styles.muted}>{history.length > 0 ? "Not linked as Same problem now." : "No other Request is linked as Same problem yet."}{canChange && " Link Requests that tackle the same problem to see each attempt and its result together."}</p>}
    {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
    <p role="status" className="sr-only">{announcement}</p>
    {history.length > 0 && <details className={styles.history}>
      <summary>Link history ({history.length})</summary>
      <ol className={styles.historyList}>{history.map(line => <li key={line.id}>{historyText(line)}</li>)}</ol>
    </details>}
  </section>
}
